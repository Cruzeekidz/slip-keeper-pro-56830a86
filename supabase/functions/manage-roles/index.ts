import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is super_admin
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check caller is super_admin
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: 'ไม่มีสิทธิ์: ต้องเป็นผู้ดูแลระบบ' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { action, email, role, roleId } = await req.json();

    if (action === 'add') {
      // Find user by email
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;

      const targetUser = users.find(u => u.email === email);
      if (!targetUser) {
        return new Response(JSON.stringify({ error: `ไม่พบผู้ใช้ email: ${email}` }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if role already exists
      const { data: existing } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('user_id', targetUser.id)
        .eq('role', role)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: 'ผู้ใช้มีสิทธิ์นี้อยู่แล้ว' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: insertError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: targetUser.id, role });

      if (insertError) throw insertError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'remove') {
      // Don't allow removing own super_admin
      const { data: targetRole } = await supabaseAdmin
        .from('user_roles')
        .select('user_id, role')
        .eq('id', roleId)
        .maybeSingle();

      if (targetRole?.user_id === user.id && targetRole?.role === 'super_admin') {
        return new Response(JSON.stringify({ error: 'ไม่สามารถลบสิทธิ์ผู้ดูแลระบบของตัวเองได้' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: deleteError } = await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('id', roleId);

      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
