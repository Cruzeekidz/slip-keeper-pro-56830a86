import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────
export interface ReadyGoEvent {
  id: string;
  title: string;
  short_code: string;
  event_date: string;
  location: string;
}

export interface RegistrationStats {
  total_registrations: number;
  completed_count: number;
  sponsored_count: number;
  total_registration_fee: number;
  total_discount: number;
  total_cruzee_discount: number;
  actual_revenue: number;
  oto1_revenue: number;
  oto1_count: number;
  oto2_revenue: number;
  oto2_count: number;
  total_oto_revenue: number;
  category_breakdown: Record<string, number>;
}

export interface EventFinancialData {
  event?: ReadyGoEvent;
  events?: ReadyGoEvent[];
  registrationStats: RegistrationStats;
  financials: any[];
  summary: {
    totalExpenses: number;
    totalOtherIncome: number;
    netProfit: number;
  };
}

export interface EventGroup {
  id: string;
  group_name: string;
  project_tag: string;
  readygo_event_ids: string[];
}

export interface OtherIncome {
  id: string;
  description: string;
  amount: number;
  income_date: string | null;
  event_group_id: string | null;
  event_id: string | null;
}

export interface ProductCost {
  id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  event_group_id: string | null;
  event_id: string | null;
}

export interface OtherExpense {
  id: string;
  description: string;
  amount: number;
  expense_date: string | null;
  is_refundable: boolean;
  refund_status: string;
  refunded_at: string | null;
  event_group_id: string | null;
  event_id: string | null;
}

export interface EventNote {
  id: string;
  note_text: string;
  note_type: string;
  is_resolved: boolean;
  resolved_at: string | null;
  event_group_id: string | null;
  event_id: string | null;
  created_at: string;
}

export interface EventReminder {
  id: string;
  reminder_type: string;
  title: string;
  description: string | null;
  amount: number;
  due_date: string;
  remind_before_days: number;
  is_completed: boolean;
  completed_at: string | null;
  notify_line: boolean;
  notify_gcal: boolean;
  line_notified_at: string | null;
  event_group_id: string | null;
  event_id: string | null;
  created_at: string;
}

// ─── Query Hooks ─────────────────────────────────────────────

/** Fetch Ready-go events list */
export function useReadyGoEvents() {
  return useQuery({
    queryKey: ["readygo-events"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-readygo-data", {
        body: { action: "list-events" },
      });
      if (error) throw error;
      return (data.events || []) as ReadyGoEvent[];
    },
  });
}

/** Fetch event groups for user */
export function useEventGroups(userId: string | undefined) {
  return useQuery({
    queryKey: ["event-groups", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_groups")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as EventGroup[];
    },
    enabled: !!userId,
  });
}

/** Fetch financials for a single event or a group (multi-event) */
export function useEventFinancials(
  eventId: string,
  groupId: string,
  groups: EventGroup[]
) {
  const group = groups.find((g) => g.id === groupId);
  const isGroup = !!groupId && !!group;
  const isSingle = !!eventId && !groupId;

  return useQuery({
    queryKey: ["event-financials", isGroup ? `group-${groupId}` : eventId],
    queryFn: async () => {
      if (isGroup && group) {
        const { data, error } = await supabase.functions.invoke("fetch-readygo-data", {
          body: { action: "multi-event-financials", event_ids: group.readygo_event_ids },
        });
        if (error) throw error;
        return data as EventFinancialData;
      } else {
        const { data, error } = await supabase.functions.invoke("fetch-readygo-data", {
          body: { action: "event-financials", event_id: eventId },
        });
        if (error) throw error;
        return data as EventFinancialData;
      }
    },
    enabled: isGroup || isSingle,
  });
}

/** Fetch local expenses matching the selected event/group */
export function useLocalExpenses(
  userId: string | undefined,
  selectedEventId: string,
  selectedGroupId: string,
  groups: EventGroup[],
  financialData: EventFinancialData | null | undefined
) {
  return useQuery({
    queryKey: ["local-expenses", selectedEventId, selectedGroupId],
    queryFn: async () => {
      if (!userId) return { items: [], total: 0 };

      let searchTerms: string[] = [];

      if (selectedGroupId) {
        const group = groups.find((g) => g.id === selectedGroupId);
        if (group) searchTerms = [group.project_tag, group.group_name];
      } else if (financialData?.event) {
        searchTerms = [financialData.event.title];
      }

      // Look up registry for aliases
      if (selectedEventId && !selectedGroupId) {
        const { data: regData } = await supabase
          .from("event_registry")
          .select("project_tag, event_name, aliases")
          .eq("readygo_event_id", selectedEventId)
          .limit(1);
        if (regData && regData.length > 0) {
          const reg = regData[0];
          searchTerms.push(reg.project_tag, reg.event_name);
          if (reg.aliases && Array.isArray(reg.aliases)) {
            searchTerms.push(...reg.aliases);
          }
        }
      }

      searchTerms = [...new Set(searchTerms.filter((t) => t && t.trim()))];
      if (searchTerms.length === 0) return { items: [], total: 0 };

      const orClauses = searchTerms
        .flatMap((t) => [
          `event_name.ilike.%${t}%`,
          `project.ilike.%${t}%`,
          `project_tag.ilike.%${t}%`,
        ])
        .join(",");

      const { data } = await supabase
        .from("expenses")
        .select("amount, description, expense_date, category, event_name, project_tag, merchant")
        .eq("user_id", userId)
        .or(orClauses)
        .order("expense_date", { ascending: false });

      const items = (data || []).map((e) => ({
        description: e.description || e.merchant || e.category || "รายจ่าย",
        amount: Number(e.amount),
        expense_date: e.expense_date,
        category: e.category,
        event_name: e.event_name,
        project_tag: e.project_tag,
      }));
      const total = items.reduce((s, e) => s + e.amount, 0);
      return { items, total };
    },
    enabled: !!userId && !!(selectedEventId || selectedGroupId) && !!financialData,
  });
}

// ─── Generic event-scoped query builder ──────────────────────

function buildEventScopedQueryKey(
  table: string,
  eventId: string,
  groupId: string
) {
  return [table, eventId, groupId];
}

async function fetchEventScoped<T>(
  table: string,
  userId: string,
  eventId: string,
  groupId: string,
  orderBy: string = "created_at",
  ascending: boolean = false
): Promise<T[]> {
  let query = supabase
    .from(table as any)
    .select("*")
    .eq("user_id", userId);

  if (groupId) {
    query = query.eq("event_group_id", groupId);
  } else if (eventId) {
    query = query.eq("event_id", eventId);
  } else {
    return [];
  }

  const { data, error } = await query.order(orderBy, { ascending });
  if (error) throw error;
  return (data || []) as T[];
}

export function useOtherIncomes(userId: string | undefined, eventId: string, groupId: string) {
  return useQuery({
    queryKey: buildEventScopedQueryKey("other-incomes", eventId, groupId),
    queryFn: () => fetchEventScoped<OtherIncome>("event_other_income", userId!, eventId, groupId),
    enabled: !!userId && !!(eventId || groupId),
  });
}

export function useProductCosts(userId: string | undefined, eventId: string, groupId: string) {
  return useQuery({
    queryKey: buildEventScopedQueryKey("product-costs", eventId, groupId),
    queryFn: () => fetchEventScoped<ProductCost>("event_product_costs", userId!, eventId, groupId),
    enabled: !!userId && !!(eventId || groupId),
  });
}

export function useOtherExpenses(userId: string | undefined, eventId: string, groupId: string) {
  return useQuery({
    queryKey: buildEventScopedQueryKey("other-expenses", eventId, groupId),
    queryFn: () => fetchEventScoped<OtherExpense>("event_other_expenses", userId!, eventId, groupId),
    enabled: !!userId && !!(eventId || groupId),
  });
}

export function useEventNotes(userId: string | undefined, eventId: string, groupId: string) {
  return useQuery({
    queryKey: buildEventScopedQueryKey("event-notes", eventId, groupId),
    queryFn: () => fetchEventScoped<EventNote>("event_notes", userId!, eventId, groupId),
    enabled: !!userId && !!(eventId || groupId),
  });
}

export function useEventReminders(userId: string | undefined, eventId: string, groupId: string) {
  return useQuery({
    queryKey: buildEventScopedQueryKey("reminders", eventId, groupId),
    queryFn: () =>
      fetchEventScoped<EventReminder>("event_reminders", userId!, eventId, groupId, "due_date", true),
    enabled: !!userId && !!(eventId || groupId),
  });
}

// ─── Mutation Hooks ──────────────────────────────────────────

/** Generic CRUD mutation factory */
function useEventScopedMutation<TPayload>(
  table: string,
  invalidateKey: string,
  eventId: string,
  groupId: string
) {
  const queryClient = useQueryClient();
  const qk = buildEventScopedQueryKey(invalidateKey, eventId, groupId);

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: TPayload }) => {
      if (id) {
        const { error } = await supabase.from(table as any).update(payload as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table as any).insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
  });

  return { saveMutation, deleteMutation };
}

export function useOtherIncomeMutations(eventId: string, groupId: string) {
  return useEventScopedMutation<any>("event_other_income", "other-incomes", eventId, groupId);
}

export function useProductCostMutations(eventId: string, groupId: string) {
  return useEventScopedMutation<any>("event_product_costs", "product-costs", eventId, groupId);
}

export function useOtherExpenseMutations(eventId: string, groupId: string) {
  return useEventScopedMutation<any>("event_other_expenses", "other-expenses", eventId, groupId);
}

export function useEventNoteMutations(eventId: string, groupId: string) {
  return useEventScopedMutation<any>("event_notes", "event-notes", eventId, groupId);
}

export function useEventReminderMutations(eventId: string, groupId: string) {
  return useEventScopedMutation<any>("event_reminders", "reminders", eventId, groupId);
}

export function useGroupMutations(userId: string | undefined) {
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: any }) => {
      if (id) {
        const { error } = await supabase.from("event_groups").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_groups").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-groups", userId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-groups", userId] }),
  });

  return { saveMutation, deleteMutation };
}

/** Toggle helpers */
export function useToggleRefundStatus(eventId: string, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (exp: OtherExpense) => {
      const newStatus = exp.refund_status === "refunded" ? "pending" : "refunded";
      const { error } = await supabase
        .from("event_other_expenses" as any)
        .update({
          refund_status: newStatus,
          refunded_at: newStatus === "refunded" ? new Date().toISOString() : null,
        })
        .eq("id", exp.id);
      if (error) throw error;
      return newStatus;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: buildEventScopedQueryKey("other-expenses", eventId, groupId),
      }),
  });
}

export function useToggleNoteResolved(eventId: string, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (note: EventNote) => {
      const newResolved = !note.is_resolved;
      const { error } = await supabase
        .from("event_notes" as any)
        .update({
          is_resolved: newResolved,
          resolved_at: newResolved ? new Date().toISOString() : null,
          note_type: newResolved ? "resolved" : "general",
        })
        .eq("id", note.id);
      if (error) throw error;
      return newResolved;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: buildEventScopedQueryKey("event-notes", eventId, groupId),
      }),
  });
}

export function useToggleReminderCompleted(eventId: string, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (r: EventReminder) => {
      const newCompleted = !r.is_completed;
      const { error } = await supabase
        .from("event_reminders" as any)
        .update({
          is_completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
        })
        .eq("id", r.id);
      if (error) throw error;
      return newCompleted;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: buildEventScopedQueryKey("reminders", eventId, groupId),
      }),
  });
}

export function useSendReminderLine(eventId: string, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reminderId: string) => {
      const { error } = await supabase.functions.invoke("send-reminder-line", {
        body: { reminder_id: reminderId },
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: buildEventScopedQueryKey("reminders", eventId, groupId),
      }),
  });
}
