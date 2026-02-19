import crypto from 'node:crypto';
import { trackAlert, trackEvent } from './events.js';

export async function proxyMcpRequest(targetName, targetUrl, body, headers = {}, context = {}) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const sanitizedHeaders = {
    'content-type': 'application/json',
    'x-apropos-request-id': requestId,
    ...headers
  };

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: sanitizedHeaders,
      body: JSON.stringify(body)
    });

    const text = await response.text();
    const durationMs = Date.now() - started;

    const payload = {
      requestId,
      targetName,
      targetUrl,
      status: response.status,
      durationMs,
      method: body?.method,
      projectId: context?.projectId || null,
      sessionId: context?.sessionId || null
    };

    await trackEvent('proxy.request', payload, response.ok ? 'info' : 'warning');

    if (!response.ok) {
      await trackAlert('proxy.action_required', payload, response.status >= 500 ? 'critical' : 'warning');
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    return {
      ok: response.ok,
      status: response.status,
      requestId,
      target: targetName,
      durationMs,
      data: parsed
    };
  } catch (error) {
    const payload = {
      requestId,
      targetName,
      targetUrl,
      error: error.message,
      method: body?.method,
      projectId: context?.projectId || null,
      sessionId: context?.sessionId || null
    };
    await trackAlert('proxy.connection_failed', payload, 'critical');

    return {
      ok: false,
      status: 502,
      requestId,
      target: targetName,
      data: {
        error: 'Proxy could not reach MCP target',
        details: error.message
      }
    };
  }
}
