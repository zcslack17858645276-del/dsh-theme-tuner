/**
 * Theme Tuner — host half.
 *
 * The entire feature lives in the browser half (`./client.js`): three
 * `settings.general.item` rows (accent / background / foreground) plus an
 * alias-token override layer registered through `ctx.theme.overrideTokens`.
 * Nothing is needed on the host side, so this entry only exists because every
 * Cordis plugin bundle carries one.
 */
export default {
  name: "theme-tuner",
  apply() {},
};
