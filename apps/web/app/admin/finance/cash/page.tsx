'use client';

import { useEffect, useState } from 'react';
import { EyeIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import {
  FINANCE_CASH_CATEGORIES_BY_DIRECTION,
  FINANCE_CASH_CATEGORY_LABELS,
  FINANCE_CASH_DIRECTION_LABELS,
  type FinanceAccountChannel,
  type FinanceAccountKind,
  type FinanceCashCategoryValue,
  type FinanceCashDirection,
  type FinanceCashMethod,
} from '@mcc/shared';
import { useCan } from '@/components/auth/permission-context';
import {
  FinanceAccountForm,
  type FinanceAccountFormInitial,
} from '@/components/finance/finance-account-form';
import { FinanceAccountDetailDialog } from '@/components/finance/finance-account-detail-dialog';
import { FinanceCashEntryDetailDialog } from '@/components/finance/finance-cash-entry-detail-dialog';
import {
  FinanceCashEntryForm,
  type FinanceCashEntryFormInitial,
} from '@/components/finance/finance-cash-entry-form';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';

// 资金流水页（product/finance.md R-财务-002；主从列表页模式见 product/平台布局.md）：
// 单一面板，左右两栏用竖线分隔；左栏 = 资金账户列表（「全部账户」默认选中，显示启用状态，
// 点击即筛选右栏，行内查看 / 编辑 / 启用停用 / 删除）；右栏 = 资金流水标准列表（筛选 / 登记 / 表格 / 合计 / 分页）。
// 两侧均提供详情弹窗（两列信息条），详情 → 编辑为状态切换、不嵌套。
// 收款挂客户、付款对象自由填写、内部转账只在账户间搬钱（不计入收支统计）。

interface AccountRow {
  id: string;
  code: string;
  name: string;
  kind: FinanceAccountKind;
  channel: FinanceAccountChannel;
  openingBalance: string;
  balance: string;
  active: boolean;
  entryCount?: number;
}

interface CustomerOption {
  id: string;
  name: string;
}

interface CashEntryRow {
  id: string;
  code: string;
  direction: FinanceCashDirection;
  occurredDate: string;
  amount: string;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  customerId: string | null;
  customerName: string;
  method: FinanceCashMethod;
  category: FinanceCashCategoryValue | null;
  note: string;
  sourceType: string | null;
  sourceId: string | null;
  sourceCode: string | null;
  sourceLabel: string | null;
  editable: boolean;
}

const PAGE_SIZE = 20;

const signedAmount = (entry: CashEntryRow): string => {
  if (entry.direction === 'in') {
    return `+${entry.amount}`;
  }
  if (entry.direction === 'out') {
    return `-${entry.amount}`;
  }
  return entry.amount;
};

const accountDisplayOf = (entry: CashEntryRow): string =>
  entry.direction === 'transfer'
    ? `${entry.accountName} → ${entry.toAccountName ?? '—'}`
    : entry.accountName;

const customerOf = (entry: CashEntryRow): string =>
  entry.category === 'sales_receipt' ? entry.customerName || '—' : '—';

export default function FinanceCashPage(): React.ReactElement {
  const canManage = useCan('finance:manage');
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  // 左栏选中项：空串 = 全部；同时作为右栏的账户筛选条件
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [filters, setFilters] = useState({
    direction: '',
    category: '',
    customerId: '',
    dateFrom: '',
    dateTo: '',
  });
  const [applied, setApplied] = useState({
    direction: '',
    category: '',
    customerId: '',
    dateFrom: '',
    dateTo: '',
  });
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    total: number;
    summary: { receipts: string; payments: string; net: string };
    items: CashEntryRow[];
  }>({ total: 0, summary: { receipts: '0.00', payments: '0.00', net: '0.00' }, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [accountDialog, setAccountDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; account: AccountRow } | null
  >(null);
  const [entryDialog, setEntryDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; entry: CashEntryRow } | null
  >(null);
  const [accountDetail, setAccountDetail] = useState<AccountRow | null>(null);
  const [entryDetail, setEntryDetail] = useState<CashEntryRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: res, response } = await api.GET('/api/v1/finance/accounts');
        if (!cancelled) {
          if (response.ok && res) {
            setAccounts(res.items);
          } else {
            setError('资金账户加载失败');
          }
        }
      } catch {
        if (!cancelled) {
          setError('资金账户加载失败');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // 客户筛选选项：只列启用客户（与登记流水的客户下拉同源）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: res, response } = await api.GET('/api/v1/customers', {
        params: { query: { page: 1, pageSize: 100, status: 'active' } },
      });
      if (!cancelled && response.ok && res) {
        setCustomers(res.items.map((item) => ({ id: item.id, name: item.name })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data: res, response } = await api.GET('/api/v1/finance/cash-entries', {
          params: {
            query: {
              page,
              pageSize: PAGE_SIZE,
              direction: (applied.direction || undefined) as FinanceCashDirection | undefined,
              category: (applied.category || undefined) as FinanceCashCategoryValue | undefined,
              accountId: selectedAccountId || undefined,
              customerId: applied.customerId || undefined,
              dateFrom: applied.dateFrom || undefined,
              dateTo: applied.dateTo || undefined,
            },
          },
        });
        if (!cancelled) {
          if (response.ok && res) {
            setData(res as typeof data);
            setError(null);
          } else {
            setError('加载失败，请稍后重试');
          }
        }
      } catch {
        if (!cancelled) {
          setError('加载失败，请稍后重试');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, applied, selectedAccountId, reloadToken]);

  const reload = (): void => setReloadToken((token) => token + 1);

  const selectAccount = (id: string): void => {
    setSelectedAccountId(id);
    setPage(1);
  };

  // 状态切换复用 PUT（入参为整行字段），行操作只反转 active
  async function putAccountStatus(account: AccountRow, active: boolean): Promise<void> {
    const { response } = await api.PUT('/api/v1/finance/accounts/{id}', {
      params: { path: { id: account.id } },
      body: {
        name: account.name,
        kind: account.kind,
        channel: account.channel,
        openingBalance: account.openingBalance,
        active,
      },
    });
    if (!response.ok) {
      throw new Error('状态切换失败');
    }
  }

  async function toggleAccountStatus(account: AccountRow): Promise<void> {
    try {
      if (account.active) {
        const ok = await confirm({
          title: '停用资金账户',
          description: `将停用账户 ${account.name}，停用后不可用于新登记流水，历史流水不受影响。`,
          confirmText: '停用',
          tone: 'danger',
          onConfirm: () => putAccountStatus(account, false),
        });
        if (!ok) {
          return;
        }
      } else {
        // 单条启用为恢复性动作，不确认（product/平台布局.md 二次确认规范）
        await putAccountStatus(account, true);
      }
      reload();
    } catch {
      setError('状态切换失败，请稍后重试');
    }
  }

  async function removeAccount(account: AccountRow): Promise<void> {
    try {
      const count = account.entryCount ?? 0;
      const ok = await confirm({
        title: '删除资金账户',
        description: `将删除账户 ${account.name}（${account.code}）。该账户有 ${count} 条流水，删除后档案不再显示、不能再登记流水，历史流水保留并显示当时的账户名称。编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/finance/accounts/{id}', {
            params: { path: { id: account.id } },
          });
          if (!response.ok) {
            throw new Error('删除失败');
          }
        },
      });
      if (ok) {
        if (selectedAccountId === account.id) {
          setSelectedAccountId('');
        }
        reload();
      }
    } catch {
      setError('删除失败，请稍后重试');
    }
  }

  async function removeEntry(entry: CashEntryRow): Promise<void> {
    try {
      const ok = await confirm({
        title: '删除资金流水',
        description: `将删除流水 ${entry.code}。删除后账户余额随之回退，编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/finance/cash-entries/{id}', {
            params: { path: { id: entry.id } },
          });
          if (!response.ok) {
            throw new Error('删除失败');
          }
        },
      });
      if (ok) {
        if (data.items.length <= 1 && page > 1) {
          setPage(page - 1);
        }
        reload();
      }
    } catch {
      setError('删除失败，请稍后重试');
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const activeCount = accounts.filter((account) => account.active).length;

  const resetFilters = (): void => {
    const empty = { direction: '', category: '', customerId: '', dateFrom: '', dateTo: '' };
    setFilters(empty);
    setApplied(empty);
    setSelectedAccountId('');
    setPage(1);
  };

  // 方向 → 分类级联：方向为空列全部分类；收款 / 付款列各自子集；
  // 内部转账不挂分类（与录入表单、详情弹窗一致），分类筛选禁用并清空
  const isTransfer = filters.direction === 'transfer';
  const allowedCategories =
    filters.direction === 'in' || filters.direction === 'out'
      ? FINANCE_CASH_CATEGORIES_BY_DIRECTION[filters.direction]
      : null;
  const categoryOptions = isTransfer
    ? [{ value: '', label: '内部转账无分类' }]
    : [
        { value: '', label: '全部' },
        ...(allowedCategories ??
          (Object.keys(FINANCE_CASH_CATEGORY_LABELS) as FinanceCashCategoryValue[])).map(
          (value) => ({ value, label: FINANCE_CASH_CATEGORY_LABELS[value] }),
        ),
      ];
  const changeDirection = (value: string): void => {
    const allowed =
      value === 'in' || value === 'out' ? FINANCE_CASH_CATEGORIES_BY_DIRECTION[value] : [];
    const category =
      filters.category && !allowed.includes(filters.category as FinanceCashCategoryValue)
        ? ''
        : filters.category;
    setFilters({ ...filters, direction: value, category });
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-lg border border-border bg-card">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="truncate text-sm font-medium">资金账户</h2>
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAccountDialog({ mode: 'create' })}
            >
              新增账户
            </Button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          <div
            className={
              selectedAccountId === ''
                ? 'relative flex items-center rounded-md bg-muted'
                : 'relative flex items-center rounded-md hover:bg-muted/60'
            }
          >
            {selectedAccountId === '' ? (
              <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded bg-primary" />
            ) : null}
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => selectAccount('')}
            >
              <span className="truncate text-sm font-semibold">全部账户</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                共 {accounts.length} 个 · {activeCount} 个启用
              </span>
            </button>
          </div>

          {accounts.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">暂无资金账户</p>
          ) : null}

          {accounts.map((account) => {
            const selected = account.id === selectedAccountId;
            return (
              <div
                key={account.id}
                className={
                  selected
                    ? 'relative mt-0.5 flex items-center rounded-md bg-muted'
                    : 'relative mt-0.5 flex items-center rounded-md hover:bg-muted/60'
                }
              >
                {selected ? (
                  <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded bg-primary" />
                ) : null}
                {/* 一行：名称（截断）+ 状态标记；整行按钮可点即筛选，操作收进行尾「⋯」菜单 */}
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 pl-3 pr-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  title={account.name}
                  onClick={() => selectAccount(account.id)}
                >
                  <span
                    className={
                      selected
                        ? 'min-w-0 flex-1 truncate text-sm font-medium'
                        : 'min-w-0 flex-1 truncate text-sm'
                    }
                  >
                    {account.name}
                  </span>
                  <span
                    className={
                      account.active
                        ? 'shrink-0 text-xs text-primary'
                        : 'shrink-0 text-xs text-muted-foreground'
                    }
                  >
                    {account.active ? '启用' : '停用'}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="账户操作"
                    title="账户操作"
                    className="mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring data-[popup-open]:bg-accent data-[popup-open]:text-accent-foreground"
                  >
                    <MoreHorizontalIcon className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setAccountDetail(account)}>
                      查看详情
                    </DropdownMenuItem>
                    {canManage ? (
                      <>
                        <DropdownMenuItem
                          onClick={() => setAccountDialog({ mode: 'edit', account })}
                        >
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void toggleAccountStatus(account)}>
                          {account.active ? '停用' : '启用'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => void removeAccount(account)}
                        >
                          删除
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied({ ...filters });
            setPage(1);
          }}
        >
          <div className="flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">方向</span>
            <Select
              value={filters.direction}
              onChange={changeDirection}
              ariaLabel="方向"
              options={[
                { value: '', label: '全部' },
                { value: 'in', label: '收款' },
                { value: 'out', label: '付款' },
                { value: 'transfer', label: '内部转账' },
              ]}
              className="w-28"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">收支分类</span>
            <Select
              value={filters.category}
              onChange={(value) => setFilters({ ...filters, category: value })}
              ariaLabel="收支分类"
              options={categoryOptions}
              disabled={isTransfer}
              className="w-32"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">日期从</span>
            <DatePicker
              value={filters.dateFrom}
              onChange={(value) => setFilters({ ...filters, dateFrom: value })}
              placeholder="开始日期"
              className="w-36"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">日期至</span>
            <DatePicker
              value={filters.dateTo}
              onChange={(value) => setFilters({ ...filters, dateTo: value })}
              placeholder="结束日期"
              className="w-36"
            />
          </div>
          {/* 客户只挂在收款流水上；付款 / 内部转账时保持可选，由数据自然过滤（无结果） */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">客户</span>
            <Select
              value={filters.customerId}
              onChange={(value) => setFilters({ ...filters, customerId: value })}
              ariaLabel="客户"
              options={[
                { value: '', label: '全部客户' },
                ...customers.map((customer) => ({ value: customer.id, label: customer.name })),
              ]}
              className="w-40"
            />
          </div>
          <Button type="submit" variant="secondary">
            查询
          </Button>
          <Button type="button" variant="outline" onClick={resetFilters}>
            重置
          </Button>
        </form>

        <div className="flex items-center gap-2">
          {canManage ? (
            <Button onClick={() => setEntryDialog({ mode: 'create' })}>登记流水</Button>
          ) : null}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
          <Table containerClassName="h-full overflow-y-auto">
            <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
              <TableRow>
                <TableHead>编号</TableHead>
                <TableHead>发生日期</TableHead>
                <TableHead>方向</TableHead>
                <TableHead>账户</TableHead>
                <TableHead>收支分类</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>来源</TableHead>
                <TableHead className="w-20 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-muted-foreground">
                    加载中…
                  </TableCell>
                </TableRow>
              ) : data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-muted-foreground">
                    暂无资金流水
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => setEntryDetail(entry)}
                      >
                        {entry.code}
                      </button>
                    </TableCell>
                    <TableCell>{entry.occurredDate}</TableCell>
                    <TableCell>{FINANCE_CASH_DIRECTION_LABELS[entry.direction]}</TableCell>
                    <TableCell>{accountDisplayOf(entry)}</TableCell>
                    <TableCell>
                      {entry.category ? FINANCE_CASH_CATEGORY_LABELS[entry.category] : '—'}
                    </TableCell>
                    <TableCell className="max-w-40 truncate" title={customerOf(entry)}>
                      {customerOf(entry)}
                    </TableCell>
                    <TableCell className="max-w-64 truncate" title={entry.note || undefined}>
                      {entry.note || '—'}
                    </TableCell>
                    <TableCell
                      className={
                        entry.direction === 'in'
                          ? 'text-right tabular-nums text-primary'
                          : entry.direction === 'out'
                            ? 'text-right tabular-nums text-destructive'
                            : 'text-right tabular-nums'
                      }
                    >
                      {signedAmount(entry)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.sourceType ? (
                        <span title={entry.sourceCode ?? undefined}>
                          {entry.sourceLabel}
                          {entry.sourceCode ? ` ${entry.sourceCode}` : ''}
                        </span>
                      ) : (
                        '手工'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="查看"
                          title="查看"
                          onClick={() => setEntryDetail(entry)}
                        >
                          <EyeIcon className="size-4" />
                        </Button>
                        {canManage && entry.editable ? (
                          <>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="编辑"
                              title="编辑"
                              onClick={() => setEntryDialog({ mode: 'edit', entry })}
                            >
                              <PencilIcon className="size-4" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="删除"
                              title="删除"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => void removeEntry(entry)}
                            >
                              <Trash2Icon className="size-4" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter className="sticky bottom-0 z-10 bg-muted [&_td]:bg-muted">
              <TableRow>
                <TableCell colSpan={5} className="font-medium">
                  合计
                </TableCell>
                <TableCell colSpan={2} className="text-right tabular-nums">
                  收款 {data.summary.receipts} / 付款 {data.summary.payments}
                </TableCell>
                <TableCell className="text-right tabular-nums">净额 {data.summary.net}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        <div className="flex items-center justify-start gap-3">
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页 · 共 {data.total} 条
          </span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </div>
      </section>

      {accountDialog !== null ? (
        <FinanceAccountForm
          key={accountDialog.mode === 'edit' ? accountDialog.account.id : 'account-create'}
          open
          initial={
            accountDialog.mode === 'edit'
              ? (accountDialog.account as FinanceAccountFormInitial)
              : undefined
          }
          onOpenChange={(open) => {
            if (!open) {
              setAccountDialog(null);
            }
          }}
          onSaved={() => {
            setAccountDialog(null);
            reload();
          }}
        />
      ) : null}

      {entryDialog !== null ? (
        <FinanceCashEntryForm
          key={entryDialog.mode === 'edit' ? entryDialog.entry.id : 'cash-create'}
          open
          accounts={accounts}
          defaultAccountId={selectedAccountId || undefined}
          initial={
            entryDialog.mode === 'edit'
              ? (entryDialog.entry as FinanceCashEntryFormInitial)
              : undefined
          }
          onOpenChange={(open) => {
            if (!open) {
              setEntryDialog(null);
            }
          }}
          onSaved={() => {
            setEntryDialog(null);
            reload();
          }}
        />
      ) : null}

      {accountDetail !== null ? (
        <FinanceAccountDetailDialog
          open
          account={accountDetail}
          onOpenChange={(open) => {
            if (!open) {
              setAccountDetail(null);
            }
          }}
          onEdit={
            canManage
              ? () => {
                  const account = accountDetail;
                  setAccountDetail(null);
                  setAccountDialog({ mode: 'edit', account });
                }
              : undefined
          }
        />
      ) : null}

      {entryDetail !== null ? (
        <FinanceCashEntryDetailDialog
          open
          entry={entryDetail}
          onOpenChange={(open) => {
            if (!open) {
              setEntryDetail(null);
            }
          }}
          onEdit={
            canManage && entryDetail.editable
              ? () => {
                  const entry = entryDetail;
                  setEntryDetail(null);
                  setEntryDialog({ mode: 'edit', entry });
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
