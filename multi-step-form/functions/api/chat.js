const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

async function updateSessionInSupabase(env, sessionId, metadata) {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey || !sessionId) return;

  try {
    const patchPayload = {
      last_message_at: new Date().toISOString()
    };

    if (metadata.tag) patchPayload.tag = metadata.tag;
    if (metadata.tag_label) patchPayload.tag_label = metadata.tag_label;
    if (typeof metadata.needs_attention === 'boolean') {
      patchPayload.needs_attention = metadata.needs_attention;
      if (metadata.needs_attention) {
        patchPayload.is_resolved = false;
        patchPayload.resolved_at = null;
      }
    }
    if (metadata.snippet) patchPayload.last_message_snippet = metadata.snippet.slice(0, 160);

    await fetch(`${supabaseUrl}/rest/v1/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(patchPayload)
    });
  } catch (err) {
    console.warn('[chat] Could not update session in Supabase:', err.message);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error("[chat] OPENROUTER_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    const { sessionId, metadataUpdate, ...openRouterPayload } = body;

    console.log("[chat] Sending request to OpenRouter", {
      model: openRouterPayload.model,
      messageCount: openRouterPayload.messages?.length,
      sessionId
    });

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openRouterPayload),
    });

    const data = await response.json();

    // Log errors from OpenRouter for debugging
    if (!response.ok || data.error) {
      console.error("[chat] OpenRouter error", {
        status: response.status,
        error: data.error,
        model: openRouterPayload.model,
      });
    }

    // Try to parse structured output from AI response to update session tags if present
    const rawAiText = data.choices?.[0]?.message?.content || "";
    let extractedMetadata = metadataUpdate || {};

    try {
      const jsonMatch = rawAiText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || rawAiText.match(/(\{[\s\S]*"reply"[\s\S]*\})/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.intent) extractedMetadata.tag = parsed.intent;
        if (parsed.tag_label) extractedMetadata.tag_label = parsed.tag_label;
        if (typeof parsed.needs_attention === 'boolean') extractedMetadata.needs_attention = parsed.needs_attention;
      }
    } catch (_) {}

    // Update session asynchronously if sessionId provided
    if (sessionId) {
      const lastUserMsg = openRouterPayload.messages?.filter(m => m.role === 'user').slice(-1)[0]?.content || "";
      extractedMetadata.snippet = lastUserMsg || rawAiText.slice(0, 100);
      await updateSessionInSupabase(env, sessionId, extractedMetadata);
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[chat] Unexpected error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}
