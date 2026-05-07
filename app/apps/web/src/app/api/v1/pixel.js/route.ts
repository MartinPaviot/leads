/**
 * GET /api/v1/pixel.js — first-party pixel script.
 * MONACO-PARITY-04 — served from our own domain so first-party
 * cookies survive third-party-cookie blockers.
 *
 * Embed contract — the marketing site adds:
 *   <script async src="https://app.elevay.dev/api/v1/pixel.js?t=<TENANT_ID>"></script>
 *
 * The script:
 *   1. Reads / sets `_eve_v` cookie (UUID, 90d, SameSite=Lax).
 *   2. POSTs `{ visitorId, url, referrer, utm }` to /api/v1/visit/track
 *      with the tenant id from the script's `?t=` query param.
 *   3. Re-fires on SPA navigation (history.pushState + popstate).
 *
 * Caching: 5-min Cache-Control on the JS file itself (immutable
 * hash would be better long-term but the runtime is small enough
 * that a 5-min refresh is fine).
 */

const SCRIPT = `(function(){var t=document.currentScript&&document.currentScript.src||"";var m=t.match(/[?&]t=([^&]+)/);var TENANT=m?decodeURIComponent(m[1]):null;if(!TENANT)return;function uuid(){return("10000000-1000-4000-8000-100000000000".replace(/[018]/g,function(c){return(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)}))}function getCookie(n){var v=("; "+document.cookie).split("; "+n+"=");if(v.length===2)return v.pop().split(";").shift();return null}function setCookie(n,v){var d=new Date();d.setTime(d.getTime()+90*24*60*60*1000);document.cookie=n+"="+v+";expires="+d.toUTCString()+";path=/;SameSite=Lax"}function getOrCreateVisitorId(){var v=getCookie("_eve_v");if(!v){v=uuid();setCookie("_eve_v",v)}return v}function utm(){var p=new URLSearchParams(window.location.search);var keys=["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"];var out={};keys.forEach(function(k){var v=p.get(k);if(v)out[k]=v});return out}var origin=document.currentScript?new URL(document.currentScript.src).origin:window.location.origin;function fire(){try{var body={tenantId:TENANT,visitorId:getOrCreateVisitorId(),url:window.location.href,referrer:document.referrer||null,utm:utm()};fetch(origin+"/api/v1/visit/track",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),keepalive:true,credentials:"omit"}).catch(function(){})}catch(e){}}fire();var lastUrl=window.location.href;var origPush=history.pushState;history.pushState=function(){origPush.apply(this,arguments);if(window.location.href!==lastUrl){lastUrl=window.location.href;fire()}};window.addEventListener("popstate",function(){if(window.location.href!==lastUrl){lastUrl=window.location.href;fire()}})})();`;

export async function GET() {
  return new Response(SCRIPT, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
