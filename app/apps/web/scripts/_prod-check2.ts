async function hit(path: string, method = "GET") {
  try { const r = await fetch(`https://www.elevay.dev${path}`, { method, redirect: "manual", signal: AbortSignal.timeout(20000) }); console.log(`${method} ${path} -> ${r.status}`); }
  catch (e) { console.log(`${path} -> FAIL ${(e as Error).message}`); }
}
async function main(){ await hit("/api/health"); await hit("/api/calls/twiml"); await hit("/api/calls/transcription"); await hit("/api/calls/transcription","POST"); await hit("/call-mode"); }
main().then(()=>process.exit(0));
