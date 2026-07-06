import type { ChipVariant } from '../ui/chip';

export interface RawSubmission {
  id: string;
  auth_user_id: string | null;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  university: string | null;
  department: string | null;
  status: string | null; // Education level (e.g. Mahasiswa S1)
  total_cost: number;
  payment_status: string | null;
  submission_status: string | null;
  title: string | null;
  created_at: string;
  actual_paid: number; // from transactions table
}

export interface Customer {
  key: string;
  authUserId: string | null;
  name: string;
  email: string;
  phone: string;
  university: string;
  department: string;
  education: string;
  totalOrders: number;
  paidCount: number;
  totalSpent: number;
  firstOrder: string;
  lastOrder: string;
  submissions: RawSubmission[];
  invoiceNames: InvoiceName[];
  isLinked: boolean;
}

/** A distinct per-survey Nama Invoice used by this account (search-only). */
export interface InvoiceName {
  name: string;
  count: number;
  lastUsed: string;
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('62')) return digits;
  return digits;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Local-part of an email, used as the researcher-name fallback for accounts
 * with no profiles name. Never returns the Nama Invoice. */
export function emailLocalPart(email: string | null): string {
  if (!email) return '';
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/** Distinct Nama Invoice values across an account's submissions, most-recent
 * first. Search-only — never rendered on Customers surfaces. */
function computeInvoiceNames(subs: RawSubmission[]): InvoiceName[] {
  const map = new Map<string, { count: number; lastUsed: string }>();
  subs.forEach((s) => {
    const nm = (s.full_name || '').trim();
    if (!nm) return;
    const prev = map.get(nm);
    if (!prev) map.set(nm, { count: 1, lastUsed: s.created_at });
    else {
      prev.count += 1;
      if (new Date(s.created_at).getTime() > new Date(prev.lastUsed).getTime()) prev.lastUsed = s.created_at;
    }
  });
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, count: v.count, lastUsed: v.lastUsed }))
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
}

export function aggregateCustomers(submissions: RawSubmission[], authNames: Map<string, { name: string; email: string }> = new Map()): Customer[] {
  const customerMap = new Map<string, Customer>();
  // Phone → key lookup for merging orphans
  const phoneToKey = new Map<string, string>();
  const emailToKey = new Map<string, string>();

  // Pass 1: Group by auth_user_id (linked submissions)
  submissions.forEach(sub => {
    if (!sub.auth_user_id) return;
    const key = `auth:${sub.auth_user_id}`;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        key, authUserId: sub.auth_user_id, name: '', email: '', phone: '', university: '', department: '', education: '',
        totalOrders: 0, paidCount: 0, totalSpent: 0, firstOrder: sub.created_at, lastOrder: sub.created_at, submissions: [], invoiceNames: [], isLinked: true,
      });
    }
    const c = customerMap.get(key)!;
    c.submissions.push(sub);
    // Track phone & email for orphan merging
    if (sub.phone_number) {
      const np = normalizePhone(sub.phone_number);
      if (np.length >= 10) phoneToKey.set(np, key);
    }
    if (sub.email) emailToKey.set(sub.email.toLowerCase(), key);
  });

  // Pass 2: Orphaned submissions (no auth_user_id)
  submissions.forEach(sub => {
    if (sub.auth_user_id) return;
    let targetKey: string | undefined;
    // Try phone match
    if (sub.phone_number) {
      const np = normalizePhone(sub.phone_number);
      if (np.length >= 10) targetKey = phoneToKey.get(np);
    }
    // Try email match
    if (!targetKey && sub.email) {
      targetKey = emailToKey.get(sub.email.toLowerCase());
    }
    if (targetKey) {
      customerMap.get(targetKey)!.submissions.push(sub);
    } else {
      // Create new unlinked customer (group by phone then email)
      let orphanKey: string | undefined;
      if (sub.phone_number) {
        const np = normalizePhone(sub.phone_number);
        if (np.length >= 10) {
          orphanKey = `phone:${np}`;
          phoneToKey.set(np, orphanKey);
        }
      }
      if (!orphanKey && sub.email) {
        orphanKey = `email:${sub.email.toLowerCase()}`;
        emailToKey.set(sub.email.toLowerCase(), orphanKey);
      }
      if (!orphanKey) orphanKey = `unknown:${sub.id}`;

      if (!customerMap.has(orphanKey)) {
        customerMap.set(orphanKey, {
          key: orphanKey, authUserId: null, name: '', email: '', phone: '', university: '', department: '', education: '',
          totalOrders: 0, paidCount: 0, totalSpent: 0, firstOrder: sub.created_at, lastOrder: sub.created_at, submissions: [], invoiceNames: [], isLinked: false,
        });
      }
      customerMap.get(orphanKey)!.submissions.push(sub);
    }
  });

  // Pass 3: Compute aggregates from latest submission
  customerMap.forEach(c => {
    c.submissions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = c.submissions[0];
    const authEntry = c.authUserId ? authNames.get(c.authUserId) : undefined;
    if (c.isLinked && c.authUserId) {
      // Linked account: identity from the auth account (profiles); never biodata/Nama Invoice.
      c.name = authEntry?.name || 'Unknown';
    } else {
      // Orphan (unlinked): no auth identity — accepted exception, use its Nama Invoice.
      c.name = latest.full_name || emailLocalPart(latest.email) || 'Unknown';
    }
    c.invoiceNames = computeInvoiceNames(c.submissions);
    c.email = (c.isLinked && authEntry?.email) ? authEntry.email : (latest.email || '-');
    c.phone = latest.phone_number || '-';
    c.university = latest.university || '-';
    c.department = latest.department || '-';
    c.education = latest.status || '-';
    c.totalOrders = c.submissions.length;
    const paid = c.submissions.filter(s => (s.payment_status || '').toLowerCase() === 'paid');
    c.paidCount = paid.length;
    c.totalSpent = paid.reduce((sum, s) => sum + (s.actual_paid || 0), 0);
    c.firstOrder = c.submissions[c.submissions.length - 1].created_at;
    c.lastOrder = c.submissions[0].created_at;
  });

  return Array.from(customerMap.values()).sort((a, b) => new Date(b.lastOrder).getTime() - new Date(a.lastOrder).getTime());
}

/**
 * Short display id for a customer aggregate — there is no natural id
 * (customers are merged from submissions), so derive one from the
 * auth user id or the aggregation key.
 */
export function customerDisplayId(c: Customer): string {
  if (c.authUserId) return c.authUserId.slice(0, 8).toUpperCase();
  const [prefix, ...rest] = c.key.split(':');
  const value = rest.join(':');
  if (prefix === 'phone') return value;
  if (prefix === 'email') return value.split('@')[0];
  return value.slice(0, 8);
}

export type CustomerTier = 'vvip' | 'vip' | 'returning' | 'new';

export function customerTier(c: Customer): CustomerTier {
  if (c.paidCount >= 5 && c.totalSpent >= 5_000_000) return 'vvip';
  if (c.paidCount >= 3 && c.totalSpent >= 1_000_000) return 'vip';
  if (c.totalOrders >= 2) return 'returning';
  return 'new';
}

const SUBMISSION_STATUS_CHIP_VARIANTS: Record<string, ChipVariant> = {
  paid: 'green',
  approved: 'green',
  in_review: 'blue',
  rejected: 'red',
  spam: 'orange',
  waiting_payment: 'amber',
  scheduled: 'indigo',
  live: 'indigo',
  slot_reserved: 'purple',
  completed: 'slate',
};

/** Chip label+variant for an order-history row; paid trumps submission status. */
export function submissionStatusChip(
  status: string | null,
  paymentStatus: string | null
): { label: string; variant: ChipVariant } {
  if ((paymentStatus || '').toLowerCase() === 'paid') return { label: 'Paid', variant: 'green' };
  const s = status || 'in_review';
  return { label: s.replace(/_/g, ' '), variant: SUBMISSION_STATUS_CHIP_VARIANTS[s] || 'slate' };
}
