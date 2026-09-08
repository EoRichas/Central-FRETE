export function startBillingScheduler(environment = process.env) {
 if (environment.BILLING_ENABLED !== "true" || environment.BILLING_SCHEDULER_ENABLED !== "true") return () => {};
 if (!environment.BILLING_CRON_SECRET) throw new Error("Configure BILLING_CRON_SECRET para ativar o agendamento.");
 const port = environment.PORT || "3000";
 let running = false;
 async function tick() {
  if (running) return;
  running = true;
  try {
   const response = await fetch(`http://127.0.0.1:${port}/api/billing/maintenance`, {method: "POST", headers: {authorization: `Bearer ${environment.BILLING_CRON_SECRET}`}, signal: AbortSignal.timeout(240000)});
   if (!response.ok) console.warn("billing_maintenance_failed", {status: response.status});
  } catch { console.warn("billing_maintenance_unavailable"); }
  finally { running = false; }
 }
 const timer = setInterval(tick, 300000);
 const first = setTimeout(tick, 15000);
 timer.unref(); first.unref();
 return () => { clearInterval(timer); clearTimeout(first); };
}
