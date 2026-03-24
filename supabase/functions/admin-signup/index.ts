import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Server misconfigured' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceKey)

    let body: {
      email?: string
      password?: string
      question_ids?: string[]
      answers?: string[]
    }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }

    const email = String(body.email ?? '')
      .trim()
      .toLowerCase()
    const password = String(body.password ?? '')
    const question_ids = body.question_ids
    const answers = body.answers

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Enter a valid email address.' }, 400)
    }
    if (password.length < 8) {
      return json({ error: 'Password must be at least 8 characters.' }, 400)
    }
    if (!Array.isArray(question_ids) || !Array.isArray(answers) || question_ids.length !== 2 || answers.length !== 2) {
      return json({ error: 'Both security questions must be answered.' }, 400)
    }

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!question_ids.every((id) => typeof id === 'string' && uuidRe.test(id))) {
      return json({ error: 'Invalid question data. Refresh the page and try again.' }, 400)
    }

    const { data: verified, error: verifyErr } = await admin.rpc('admin_gate_verify_answers', {
      p_ids: question_ids,
      p_answers: answers.map((a) => String(a ?? '')),
    })

    if (verifyErr) {
      console.error('admin_gate_verify_answers', verifyErr)
      return json({ error: 'Could not verify answers. Try again later.' }, 500)
    }

    if (verified !== true) {
      return json(
        {
          error:
            'Those answers do not match our records. Check spelling or ask an existing admin for help.',
        },
        403,
      )
    }

    // Confirmed immediately so new admins can sign in without waiting on email (Dashboard SMTP optional).
    // To require email confirmation instead, set email_confirm: false and ensure Auth → Email + redirect URLs work.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createErr || !created?.user?.id) {
      const msg = createErr?.message ?? 'Could not create account.'
      const lower = msg.toLowerCase()
      if (lower.includes('already') || lower.includes('registered') || lower.includes('exists')) {
        return json({ error: 'An account with this email already exists. Sign in instead.' }, 409)
      }
      return json({ error: msg }, 400)
    }

    const uid = created.user.id

    const { error: profileErr } = await admin.from('profiles').upsert(
      {
        id: uid,
        display_name: email.split('@')[0] ?? 'Admin',
      },
      { onConflict: 'id' },
    )

    if (profileErr) {
      console.error('profiles upsert', profileErr)
      await admin.auth.admin.deleteUser(uid)
      return json({ error: 'Could not finish signup. Please try again.' }, 500)
    }

    const { error: roleErr } = await admin.from('user_roles').insert({
      user_id: uid,
      role: 'admin',
    })

    if (roleErr) {
      console.error('user_roles insert', roleErr)
      await admin.auth.admin.deleteUser(uid)
      return json({ error: 'Could not assign admin role. Please try again.' }, 500)
    }

    return json({ ok: true, needsEmailConfirmation: false })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return json({ error: msg }, 500)
  }
})
