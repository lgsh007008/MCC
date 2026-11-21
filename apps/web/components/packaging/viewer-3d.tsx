'use client';

import * as React from 'react';
import { buildPalletScene, type PalletGeometry } from '@mcc/shared';

// 3D 默认取景放大倍数：初始视图与「复位」都回到这个比例，与 2D 默认取景保持视觉平衡。
const DEFAULT_CAMERA_ZOOM = 1.15;

interface PalletViewer3DProps {
  geometry: PalletGeometry;
  selectedIndex: number;
  onSelect: (componentIndex: number) => void;
  onFallback?: () => void;
  className?: string;
  resetToken?: number;
  /** 由外层统一画布框提供边框与圆角时，去掉自身卡片样式 */
  frameless?: boolean;
  /** 自动缓慢旋转（公开落地页演示用）；默认关闭，工作台行为不变 */
  autoRotate?: boolean;
  /** 底部操作提示；传 null 隐藏 */
  hint?: string | null;
}

interface ViewerApi {
  reset: () => void;
  zoom: (factor: number) => void;
  exportObj: () => void;
  exportStl: () => void;
  setAutoRotate: (enabled: boolean) => void;
}

export interface Viewer3DHandle {
  zoom: (factor: number) => void;
  exportObj: () => void;
  exportStl: () => void;
}

// 3D 视图（design/包装设计.md §4.4 / §9.2）：
// Three.js 正交相机 + OrbitControls；只在 3D 页签加载；WebGL 不可用时回退轴测图。
export const Viewer3D = React.forwardRef<Viewer3DHandle, PalletViewer3DProps>(function Viewer3D({
  geometry,
  selectedIndex,
  onSelect,
  onFallback,
  className,
  resetToken,
  frameless = false,
  autoRotate = false,
  hint = '左键旋转 · 滚轮缩放 · 右键平移 · 点击构件选中',
}, ref): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const meshesRef = React.useRef<Array<import('three').Mesh>>([]);
  const threeRef = React.useRef<typeof import('three') | null>(null);
  const sceneRef = React.useRef<import('three').Scene | null>(null);
  const renderRef = React.useRef<(() => void) | null>(null);
  const selectionBoxRef = React.useRef<import('three').Box3Helper | null>(null);
  const apiRef = React.useRef<ViewerApi | null>(null);
  const onSelectRef = React.useRef(onSelect);
  const onFallbackRef = React.useRef(onFallback);
  const autoRotateRef = React.useRef(autoRotate);
  onSelectRef.current = onSelect;
  onFallbackRef.current = onFallback;
  autoRotateRef.current = autoRotate;
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useImperativeHandle(
    ref,
    () => ({
      zoom: (factor: number) => apiRef.current?.zoom(factor),
      exportObj: () => apiRef.current?.exportObj(),
      exportStl: () => apiRef.current?.exportStl(),
    }),
    [],
  );

  React.useEffect(() => {
    let disposed = false;
    let cleanup = (): void => undefined;
    setReady(false);
    setError(null);

    void (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const container = containerRef.current;
      if (!container || disposed) return;
      threeRef.current = THREE;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setError('当前浏览器不支持 WebGL，已回退到轴测图。');
        onFallbackRef.current?.();
        return;
      }

      const scene = new THREE.Scene();
      sceneRef.current = scene;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const maxDim = Math.max(geometry.L, geometry.W, geometry.H, 1);
      const frustum = maxDim * 0.95;
      const aspect = width / height;
      const camera = new THREE.OrthographicCamera(
        -frustum * aspect,
        frustum * aspect,
        frustum,
        -frustum,
        0.1,
        maxDim * 20,
      );
      camera.up.set(0, 0, 1);
      camera.zoom = DEFAULT_CAMERA_ZOOM;
      camera.updateProjectionMatrix();
      const center = new THREE.Vector3(geometry.L / 2, geometry.W / 2, geometry.H / 2);
      const setCamera = (): void => {
        camera.position.set(center.x + maxDim * 1.2, center.y - maxDim * 1.2, center.z + maxDim * 1.1);
        camera.lookAt(center);
      };
      setCamera();

      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);
      container.append(renderer.domElement);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';

      // 木纹贴图程序化生成，避免引入外部位图资源。
      const createWoodTexture = (): import('three').CanvasTexture => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#e7d9c4';
          context.fillRect(0, 0, 512, 512);
          for (let i = 0; i < 240; i += 1) {
            const y = Math.random() * 512;
            const tone = 96 + Math.round(Math.random() * 64);
            context.strokeStyle = `rgba(${tone}, ${tone - 26}, ${tone - 52}, ${
              0.04 + Math.random() * 0.1
            })`;
            context.lineWidth = 0.6 + Math.random() * 2.4;
            context.beginPath();
            context.moveTo(0, y);
            for (let x = 0; x <= 512; x += 16) {
              context.lineTo(x, y + Math.sin((x + i * 17) / 42) * 4);
            }
            context.stroke();
          }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        return texture;
      };
      const woodTexture = createWoodTexture();

      // 半球光打底，主光与冷色补光拉开明暗层次；不使用地面与阴影，保证任意视角背景干净。
      scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7c68, 1.25));
      const keyLight = new THREE.DirectionalLight(0xfff8ef, 2.1);
      keyLight.position.set(maxDim * 1.4, -maxDim * 1.2, maxDim * 2.2);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xdfe8ff, 0.5);
      fillLight.position.set(-maxDim * 1.6, maxDim * 1.1, maxDim * 0.6);
      scene.add(fillLight);

      const disposeMeshes = (): void => {
        for (const mesh of meshesRef.current) {
          mesh.geometry.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) {
            material.forEach((item) => {
              const mapped = item as import('three').MeshStandardMaterial;
              if (mapped.map) mapped.map.dispose();
              item.dispose();
            });
          } else {
            const mapped = material as import('three').MeshStandardMaterial;
            if (mapped.map) mapped.map.dispose();
            material.dispose();
          }
          const edge = (mesh as unknown as { userData: { edge?: import('three').LineSegments } }).userData.edge;
          if (edge) {
            edge.geometry.dispose();
            (edge.material as import('three').Material).dispose();
          }
          scene.remove(mesh);
        }
        meshesRef.current = [];
      };

      const buildMeshes = (): void => {
        disposeMeshes();
        for (const item of buildPalletScene(geometry.pieces)) {
          let meshGeometry: import('three').BufferGeometry;
          if (item.kind === 'notchedStringer') {
            const [l, w, h] = item.size;
            const shape = new THREE.Shape();
            shape.moveTo(0, h);
            shape.lineTo(l, h);
            shape.lineTo(l, 0);
            for (const centerRatio of [0.75, 0.25]) {
              const right = l * centerRatio + item.notchWidth / 2;
              const left = l * centerRatio - item.notchWidth / 2;
              shape.lineTo(right, 0);
              shape.lineTo(right, item.notchHeight);
              shape.lineTo(left, item.notchHeight);
              shape.lineTo(left, 0);
            }
            shape.lineTo(0, 0);
            shape.closePath();
            const extruded = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
            extruded.rotateX(Math.PI / 2);
            extruded.center();
            meshGeometry = extruded;
          } else {
            meshGeometry = new THREE.BoxGeometry(item.size[0], item.size[1], item.size[2]);
          }
          const material =
            item.role === 'steelStrap'
              ? new THREE.MeshStandardMaterial({
                  color: item.color,
                  roughness: 0.34,
                  metalness: 0.72,
                  emissive: new THREE.Color('#000000'),
                })
              : new THREE.MeshStandardMaterial({
                  color: item.color,
                  map: woodTexture.clone(),
                  roughness: 0.84,
                  metalness: 0,
                  emissive: new THREE.Color('#000000'),
                });
          if (material.map) {
            material.map.repeat.set(
              Math.max(1, Math.round(item.size[0] / 420)),
              Math.max(1, Math.round(item.size[2] / 420)),
            );
            material.map.needsUpdate = true;
          }
          const mesh = new THREE.Mesh(meshGeometry, material);
          mesh.position.set(item.center[0], item.center[1], item.center[2]);
          mesh.userData.componentIndex = item.componentIndex;
          scene.add(mesh);
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(meshGeometry),
            new THREE.LineBasicMaterial({ color: 0x4a3826, transparent: true, opacity: 0.35 }),
          );
          edges.position.copy(mesh.position);
          mesh.userData.edge = edges;
          scene.add(edges);
          meshesRef.current.push(mesh);
        }
      };

      buildMeshes();

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(center);
      controls.enableDamping = false;
      controls.autoRotateSpeed = 0.8;
      controls.update();
      controls.addEventListener('change', () => renderer.render(scene, camera));

      // 自动旋转需要持续渲染；默认关闭，工作台仍只在交互时渲染。
      // 只切换 OrbitControls 与渲染循环，不重建场景：落地页按视口进出时高频开关。
      let autoRotateFrame = 0;
      const autoRotateTick = (): void => {
        autoRotateFrame = requestAnimationFrame(autoRotateTick);
        controls.update();
        renderer.render(scene, camera);
      };
      const setAutoRotate = (enabled: boolean): void => {
        if (enabled) {
          if (autoRotateFrame) return;
          controls.autoRotate = true;
          controls.update();
          autoRotateTick();
          return;
        }
        controls.autoRotate = false;
        if (autoRotateFrame) {
          cancelAnimationFrame(autoRotateFrame);
          autoRotateFrame = 0;
        }
        renderer.render(scene, camera);
      };
      setAutoRotate(autoRotateRef.current);

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let pendingPointerUp: ((event: PointerEvent) => void) | null = null;
      // 拖动旋转不应触发选中：按下与抬起位移小于 4px 才视为点击。
      const handlePointerDown = (event: PointerEvent): void => {
        const startX = event.clientX;
        const startY = event.clientY;
        const handlePointerUp = (upEvent: PointerEvent): void => {
          window.removeEventListener('pointerup', handlePointerUp);
          pendingPointerUp = null;
          if (Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY) > 4) return;
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((upEvent.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((upEvent.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(meshesRef.current, false)[0];
          if (hit) {
            onSelectRef.current(Number(hit.object.userData.componentIndex));
          } else {
            // 点击空白处取消选中，让画布 / 表格 / 右栏同步回到未选状态
            onSelectRef.current(-1);
          }
        };
        pendingPointerUp = handlePointerUp;
        window.addEventListener('pointerup', handlePointerUp);
      };
      renderer.domElement.addEventListener('pointerdown', handlePointerDown);

      const resize = (): void => {
        const nextWidth = Math.max(1, container.clientWidth);
        const nextHeight = Math.max(1, container.clientHeight);
        const nextAspect = nextWidth / nextHeight;
        camera.left = -frustum * nextAspect;
        camera.right = frustum * nextAspect;
        camera.top = frustum;
        camera.bottom = -frustum;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight);
        renderer.render(scene, camera);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(container);
      renderRef.current = () => renderer.render(scene, camera);
      renderer.render(scene, camera);
      setReady(true);

      apiRef.current = {
        reset: () => {
          setCamera();
          camera.zoom = DEFAULT_CAMERA_ZOOM;
          camera.updateProjectionMatrix();
          controls.target.copy(center);
          controls.update();
          renderer.render(scene, camera);
        },
        zoom: (factor) => {
          camera.zoom = Math.min(4, Math.max(0.4, camera.zoom * factor));
          camera.updateProjectionMatrix();
          controls.update();
          renderer.render(scene, camera);
        },
        exportObj: () => {
          void import('three/examples/jsm/exporters/OBJExporter.js').then(({ OBJExporter }) => {
            const content = new OBJExporter().parse(scene);
            download(`${geometry.L}x${geometry.W}-pallet.obj`, content, 'text/plain');
          });
        },
        exportStl: () => {
          void import('three/examples/jsm/exporters/STLExporter.js').then(({ STLExporter }) => {
            const content = new STLExporter().parse(scene);
            download(`${geometry.L}x${geometry.W}-pallet.stl`, content, 'application/octet-stream');
          });
        },
        setAutoRotate,
      };

      cleanup = () => {
        observer.disconnect();
        cancelAnimationFrame(autoRotateFrame);
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        if (pendingPointerUp) window.removeEventListener('pointerup', pendingPointerUp);
        controls.dispose();
        disposeMeshes();
        woodTexture.dispose();
        selectionBoxRef.current?.removeFromParent();
        selectionBoxRef.current?.geometry.dispose();
        (selectionBoxRef.current?.material as import('three').Material | undefined)?.dispose();
        selectionBoxRef.current = null;
        sceneRef.current = null;
        renderRef.current = null;
        renderer.dispose();
        renderer.domElement.remove();
        apiRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [geometry]);

  // 视口进出 / 减弱动效只切换旋转，不重建 three 场景
  React.useEffect(() => {
    apiRef.current?.setAutoRotate(autoRotate);
  }, [autoRotate]);

  React.useEffect(() => {
    if (resetToken) {
      apiRef.current?.reset();
    }
  }, [resetToken]);

  React.useEffect(() => {
    const THREE = threeRef.current;
    if (!THREE) return;
    let selectedMesh: import('three').Mesh | undefined;
    for (const mesh of meshesRef.current) {
      const material = mesh.material as import('three').MeshStandardMaterial;
      const selected = Number(mesh.userData.componentIndex) === selectedIndex;
      if (selected) selectedMesh = mesh;
      material.emissive.set(selected ? '#b83e38' : '#000000');
      material.emissiveIntensity = selected ? 0.4 : 0;
      material.needsUpdate = true;
    }

    // 选中包围盒：比 emissive 更明确，分屏小窗也能一眼定位。
    const previous = selectionBoxRef.current;
    if (previous) {
      previous.removeFromParent();
      previous.geometry.dispose();
      (previous.material as import('three').Material).dispose();
      selectionBoxRef.current = null;
    }
    const scene = sceneRef.current;
    if (scene && selectedMesh) {
      const box = new THREE.Box3().setFromObject(selectedMesh);
      const helper = new THREE.Box3Helper(box, new THREE.Color('#b83e38'));
      const material = helper.material as import('three').LineBasicMaterial;
      material.depthTest = false;
      helper.renderOrder = 20;
      scene.add(helper);
      selectionBoxRef.current = helper;
    }
    renderRef.current?.();
  }, [selectedIndex, ready]);

  return (
    <div
      className={`relative w-full overflow-hidden ${
        frameless ? '' : 'rounded-lg border border-border bg-muted/20'
      } ${className ?? 'h-[520px]'}`}
    >
      <div ref={containerRef} className="h-full w-full" />
      {error ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : null}
      {!ready && !error ? (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">正在加载 3D 视图…</div>
      ) : null}
      {hint ? (
        <p className="pointer-events-none absolute bottom-2 left-3 right-3 text-right text-wb-meta text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
