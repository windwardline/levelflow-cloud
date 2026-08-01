// The support inbox, once.
//
// It is a shared inbox across apps, so every mailto names the app it came from —
// otherwise an inbound message arrives with no way to route it. That subject line
// is a mail rule on the other end, which is why it cannot be three literals: the
// app, the login screen and the parking screen each carried their own copy, and the
// third had already drifted into a different shape, inlining the address instead of
// building it from the const the other two used. A subject-line change would have
// missed a surface, and nothing would have failed.
//
// The static pages cannot import this — no build step reaches them — so
// tests/appFrame.test.ts reads their Help href against this value instead of
// restating it.
export const SUPPORT_EMAIL = "help@windwardline.com";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${
  encodeURIComponent("[Levelflow] Help")
}`;
