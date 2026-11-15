'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FEATURE_LABELS,
  SELLABLE_FEATURES,
  planCreateSchema,
  type ApiSchemas,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { opsApi } from '@/lib/ops/api';

// 套餐管理（design/租户.md §7）：列表 + 新建 / 编辑弹窗 + 启停；功能只列可售功能，基础功能不在选项中。
type PlanRow = ApiSchemas['PlanDto'];
type PlanList = ApiSchemas['PlanListDto'];

const EMPTY_LIST: PlanList = { total: 0, items: [] };

export default function OpsPlansPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [target, setTarget] = useState<PlanRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    maxAccounts: '20',
    note: '',
    featureCodes: new Set<string>(),
  });

  const listQuery = useQuery({
    queryKey: ['ops-plans'],
    queryFn: async (): Promise<PlanList> => {
      const { data, response } = await opsApi.GET('/api/v1/ops/plans');
      if (!response.ok || !data) {
        throw new Error('加载失败，请稍后重试');
      }
      return data;
    },
  });
  const data = listQuery.data ?? EMPTY_LIST;

  function openCreate(): void {
    setTarget(null);
    setForm({ name: '', maxAccounts: '20', note: '', featureCodes: new Set() });
    setError(null);
    setOpen(true);
  }

  function openEdit(plan: PlanRow): void {
    setTarget(plan);
    setForm({
      name: plan.name,
      maxAccounts: String(plan.maxAccounts),
      note: plan.note,
      featureCodes: new Set(plan.featureCodes),
    });
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const parsed = planCreateSchema.safeParse({
      name: form.name,
      maxAccounts: Number(form.maxAccounts),
      note: form.note,
      featureCodes: [...form.featureCodes],
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const result = target
        ? await opsApi.PUT('/api/v1/ops/plans/{id}', {
            params: { path: { id: target.id } },
            body: parsed.data,
          })
        : await opsApi.POST('/api/v1/ops/plans', { body: parsed.data });
      if (!result.response.ok) {
        const body = (await result.response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '保存失败，请稍后重试');
        return;
      }
      setOpen(false);
      setNotice(target ? '套餐已更新' : '套餐已创建');
      await queryClient.invalidateQueries({ queryKey: ['ops-plans'] });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(plan: PlanRow): Promise<void> {
    setError(null);
    setNotice(null);
    const nextStatus = plan.status === 'active' ? 'inactive' : 'active';
    if (nextStatus === 'inactive') {
      const ok = await confirm({
        title: '停用套餐',
        description: `停用「${plan.name}」后，新租户不可选择该套餐；存量租户不受影响。`,
        confirmText: '停用',
        tone: 'danger',
      });
      if (!ok) {
        return;
      }
    }
    const { response } = await opsApi.PATCH('/api/v1/ops/plans/{id}/status', {
      params: { path: { id: plan.id } },
      body: { status: nextStatus },
    });
    if (!response.ok) {
      setError('操作失败，请稍后重试');
      return;
    }
    setNotice(nextStatus === 'active' ? '套餐已启用' : '套餐已停用');
    await queryClient.invalidateQueries({ queryKey: ['ops-plans'] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-start">
        <Button onClick={openCreate}>新建套餐</Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
        <Table containerClassName="h-full overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>包含功能</TableHead>
              <TableHead>账号额度</TableHead>
              <TableHead>租户数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建日期</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isPending ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  暂无套餐
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>{plan.name}</TableCell>
                  <TableCell className="max-w-[280px] truncate">
                    {plan.featureCodes
                      .map((code) => FEATURE_LABELS[code as keyof typeof FEATURE_LABELS] ?? code)
                      .join('、') || '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">{plan.maxAccounts}</TableCell>
                  <TableCell className="tabular-nums">{plan.tenantCount}</TableCell>
                  <TableCell>{plan.status === 'active' ? '启用' : '停用'}</TableCell>
                  <TableCell className="tabular-nums">{plan.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(plan)}
                      >
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant={plan.status === 'active' ? 'outline' : 'secondary'}
                        size="sm"
                        onClick={() => void handleToggleStatus(plan)}
                      >
                        {plan.status === 'active' ? '停用' : '启用'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{target ? '编辑套餐' : '新建套餐'}</DialogTitle>
            <DialogDescription>
              功能只含可售清单；账号额度为未删除账号数上限（含停用）。
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="planName">套餐名称</Label>
              <Input
                id="planName"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="planQuota">账号额度</Label>
              <Input
                id="planQuota"
                type="number"
                min={0}
                value={form.maxAccounts}
                onChange={(event) => setForm({ ...form, maxAccounts: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>包含功能</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {SELLABLE_FEATURES.map((code) => (
                  <label key={code} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.featureCodes.has(code)}
                      onCheckedChange={(value) => {
                        setForm((prev) => {
                          const next = new Set(prev.featureCodes);
                          if (value === true) {
                            next.add(code);
                          } else {
                            next.delete(code);
                          }
                          return { ...prev, featureCodes: next };
                        });
                      }}
                    />
                    {FEATURE_LABELS[code]}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="planNote">备注</Label>
              <Textarea
                id="planNote"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
