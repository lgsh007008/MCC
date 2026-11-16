'use client';

import * as React from 'react';
import { buildPalletScene, type PalletGeometry } from '@mcc/shared';
import { Button } from '@/components/ui/button';

interface PalletViewer3DProps {
  geometry: PalletGeometry;
  selectedIndex: number;
  onSelect: (componentIndex: number) => void;
  onFallback?: () => void;
}

interface ViewerApi {
  reset: () => void;
  exportObj: () => void;
  exportStl: () => void;
}

// 3D 视图（design/托盘设计.md §3.3 / §7.2）：
// Three.js 正交相机 + OrbitControls；只在 3D 页签加载；WebGL 不可用时回退轴测图。
export function PalletViewer3D({
  geometry,
  selectedIndex,
  onSelect,
  onFallback,
}: PalletViewer3DProps): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const meshesRef = React.useRef<Array<import('three').Mesh>>([]);
  const threeRef = React.useRef<typeof import('three') | null>(null);
  const apiRef = React.useRef<ViewerApi | null>(null);
  const onSelectRef = React.useRef(onSelect);
  const onFallbackRef = React.useRef(onFallback);
  onSelectRef.current = onSelect;
  onFallbackRef.current = onFallback;
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

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

      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const light = new THREE.DirectionalLight(0xffffff, 1.8);
      light.position.set(1, -1, 2);
      scene.add(light);

      const disposeMeshes = (): void => {
        for (const mesh of meshesRef.current) {
          mesh.geometry.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) {
            material.forEach((item) => item.dispose());
          } else {
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
          const material = new THREE.MeshStandardMaterial({
            color: item.color,
            roughness: 0.72,
            metalness: 0,
            emissive: new THREE.Color('#000000'),
          });
          const mesh = new THREE.Mesh(meshGeometry, material);
          mesh.position.set(item.center[0], item.center[1], item.center[2]);
          mesh.userData.componentIndex = item.componentIndex;
          scene.add(mesh);
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(meshGeometry),
            new THREE.LineBasicMaterial({ color: 0x5b4636, transparent: true, opacity: 0.65 }),
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
      controls.update();
      controls.addEventListener('change', () => renderer.render(scene, camera));

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const handlePointerDown = (event: PointerEvent): void => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(meshesRef.current, false)[0];
        if (hit) {
          onSelectRef.current(Number(hit.object.userData.componentIndex));
        }
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
      renderer.render(scene, camera);
      setReady(true);

      apiRef.current = {
        reset: () => {
          setCamera();
          controls.target.copy(center);
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
      };

      cleanup = () => {
        observer.disconnect();
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        controls.dispose();
        disposeMeshes();
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

  React.useEffect(() => {
    const THREE = threeRef.current;
    if (!THREE) return;
    for (const mesh of meshesRef.current) {
      const material = mesh.material as import('three').MeshStandardMaterial;
      const selected = Number(mesh.userData.componentIndex) === selectedIndex;
      material.emissive.set(selected ? '#b83e38' : '#000000');
      material.emissiveIntensity = selected ? 0.28 : 0;
      material.needsUpdate = true;
    }
  }, [selectedIndex, ready]);

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-lg border border-border bg-muted/20">
      <div ref={containerRef} className="h-full w-full" />
      {error ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : null}
      {!ready && !error ? (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">正在加载 3D 视图…</div>
      ) : null}
      <div className="absolute right-2 top-2 flex gap-1">
        <Button size="xs" variant="outline" onClick={() => apiRef.current?.reset()}>
          复位视角
        </Button>
        <Button size="xs" variant="outline" onClick={() => apiRef.current?.exportObj()}>
          导出 OBJ
        </Button>
        <Button size="xs" variant="outline" onClick={() => apiRef.current?.exportStl()}>
          导出 STL
        </Button>
      </div>
      <p className="absolute bottom-2 left-3 text-[11px] text-muted-foreground">左键旋转 · 滚轮缩放 · 右键平移 · 点击构件选中</p>
    </div>
  );
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
