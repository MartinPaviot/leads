/* Jitsi web custom config — mounted by docker-jitsi-meet at
 * ~/.jitsi-meet-cfg/web/custom-config.js (appended to config.js).
 *
 * The one setting that matters for the prospect: disableDeepLinking stops the
 * mobile "open in the app" interstitial, so a phone joins straight in the
 * browser (no install, no account). The app already appends this to the join
 * URL too; setting it server-side here makes the clean URL behave the same. */
config.disableDeepLinking = true;

/* Keep the pre-join screen so the prospect can check mic/cam before entering
 * (reduces "my camera doesn't work" friction mid-call). Set to false to drop
 * one tap. */
config.prejoinConfig = { enabled: true };
