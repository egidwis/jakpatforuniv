const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

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

    console.log("[chat] Sending request to OpenRouter", {
      model: body.model,
      messageCount: body.messages?.length,
    });

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // Log errors from OpenRouter for debugging
    if (!response.ok || data.error) {
      console.error("[chat] OpenRouter error", {
        status: response.status,
        error: data.error,
        model: body.model,
      });
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
