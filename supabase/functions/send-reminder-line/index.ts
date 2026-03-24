import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lineChannelAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!lineChannelAccessToken) {
      throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    
    // Mode 1: Manual send (reminder_id provided)
    // Mode 2: Cron check (no reminder_id, checks all due reminders)
    const { reminder_id } = body;

    let remindersToSend: any[] = [];

    if (reminder_id) {
      // Manual send - get specific reminder
      const { data, error } = await supabase
        .from('event_reminders')
        .select('*')
        .eq('id', reminder_id)
        .single();
      
      if (error || !data) throw new Error('ไม่พบแจ้งเตือน');
      remindersToSend = [data];
    } else {
      // Cron mode - get all due reminders that haven't been notified
      const today = new Date();
      const { data, error } = await supabase
        .from('event_reminders')
        .select('*')
        .eq('is_completed', false)
        .eq('notify_line', true)
        .is('line_notified_at', null);

      if (error) throw error;

      // Filter reminders where due_date - remind_before_days <= today
      remindersToSend = (data || []).filter((r: any) => {
        const dueDate = new Date(r.due_date);
        const remindDate = new Date(dueDate.getTime() - r.remind_before_days * 86400000);
        return remindDate <= today;
      });
    }

    if (remindersToSend.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get admin LINE user IDs
    const { data: admins } = await supabase
      .from('line_user_roles')
      .select('line_user_id, display_name')
      .in('role', ['admin', 'owner']);

    if (!admins || admins.length === 0) {
      throw new Error('ไม่พบ admin ในระบบ LINE');
    }

    const REMINDER_TYPE_LABELS: Record<string, string> = {
      billing: '📋 แจ้งเตือนวางบิล',
      payment_check: '💳 เช็คยอดโอน/รับเช็ค',
      deposit_refund: '💰 ทวงคืนมัดจำ',
      outstanding: '⚠️ ค่าใช้จ่ายค้างจ่าย',
    };

    let sentCount = 0;

    for (const reminder of remindersToSend) {
      const typeLabel = REMINDER_TYPE_LABELS[reminder.reminder_type] || '🔔 แจ้งเตือน';
      const dueDate = new Date(reminder.due_date).toLocaleDateString('th-TH', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      const amountText = reminder.amount > 0
        ? `\n💵 จำนวนเงิน: ฿${Number(reminder.amount).toLocaleString('th-TH')}`
        : '';

      const message = `${typeLabel}\n\n📌 ${reminder.title}${reminder.description ? `\n📝 ${reminder.description}` : ''}${amountText}\n📅 ครบกำหนด: ${dueDate}`;

      // Send to all admins
      for (const admin of admins) {
        try {
          const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${lineChannelAccessToken}`,
            },
            body: JSON.stringify({
              to: admin.line_user_id,
              messages: [{ type: 'text', text: message }],
            }),
          });

          if (!res.ok) {
            console.error(`Failed to send to ${admin.display_name}:`, await res.text());
          }
        } catch (err) {
          console.error(`Error sending to ${admin.display_name}:`, err);
        }
      }

      // Mark as notified
      await supabase
        .from('event_reminders')
        .update({ line_notified_at: new Date().toISOString() })
        .eq('id', reminder.id);

      sentCount++;
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
