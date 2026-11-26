/**
 * Theme Tuner — browser half.
 *
 * Registers three `settings.general.item` rows in the General settings section:
 * accent, background and foreground color. Each row mirrors the Codex appearance
 * control (a "custom" dropdown pill showing a color dot and the hex value) and
 * expands an inline panel with preset swatches, a hex input and a reset button.
 *
 * Chosen colors are folded into a single alias-token override layer registered
 * through `ctx.theme.overrideTokens("theme-tuner", ...)`. The host's ThemePresenter
 * writes the composed snapshot onto `body` as inline custom properties, so the
 * whole client recolors on the next frame without a reload. Semantic state colors
 * (success / error / warn / diff / masks) are intentionally left untouched.
 *
 * The palette is stored in localStorage under `dsh.theme-tuner.v1`; with no stored
 * colors the override layer is removed and the host palette comes back untouched.
 */
window.__ModuleLoader__.load({
  id: "@local/dsh-theme-tuner",
  factory: (require) => {
    const React = require("react");
    const h = React.createElement;

    const NS = "theme-tuner";
    const STORAGE_KEY = "dsh.theme-tuner.v1";
    const STYLE_ID = "@local/dsh-theme-tuner/client.css";
    const SOURCE = "theme-tuner";

    const ROWS = {
      accent: { id: "theme-tuner-accent", order: 13, fallback: "#4176e6" },
      background: { id: "theme-tuner-background", order: 14, fallback: "#151517" },
      foreground: { id: "theme-tuner-foreground", order: 15, fallback: "#f9fafb" },
    };

    const PRESETS = {
      accent: [
        "#22D3EE", "#06B6D4", "#4176E6", "#7AAAFF", "#A78BFA",
        "#F472B6", "#34D399", "#FBBF24", "#FB7185", "#60A5FA",
      ],
      background: [
        "#0D1117", "#0B0F14", "#151517", "#101820", "#0F172A",
        "#161B22", "#1B1035", "#231A2E", "#2C2C2E", "#000000",
      ],
      foreground: [
        "#FAB5EE", "#E6EDF3", "#C9D1D9", "#F9FAFB", "#A6F3FF",
        "#FADCF5", "#D1D5DB", "#FDE68A", "#9BE15D", "#FFFFFF",
      ],
    };

    /* ------------------------------------------------------------------ *
     * color helpers
     * ------------------------------------------------------------------ */

    function clampByte(value) {
      const n = typeof value === "number" ? value : Number(value);
      return Math.max(0, Math.min(255, Number.isFinite(n) ? n : 0));
    }

    function hexByte(value) {
      return clampByte(value).toString(16).padStart(2, "0");
    }

    function hexToRgb(value) {
      if (typeof value !== "string") return null;
      let text = value.trim().toLowerCase();
      if (text.startsWith("#")) text = text.slice(1);
      if (text.length === 3) {
        text = text[0] + text[0] + text[1] + text[1] + text[2] + text[2];
      }
      if (!/^[0-9a-f]{6}$/.test(text)) return null;
      return {
        r: parseInt(text.slice(0, 2), 16),
        g: parseInt(text.slice(2, 4), 16),
        b: parseInt(text.slice(4, 6), 16),
      };
    }

    /** Accept #rgb / #rrggbb / #rrggbbaa; returns "#rrggbb" (alpha dropped) or null. */
    function normalizeHex(value) {
      if (typeof value !== "string") return null;
      let text = value.trim().toLowerCase();
      if (!text.startsWith("#")) text = "#" + text;
      if (/^#[0-9a-f]{3}$/.test(text)) {
        return "#" + text[1] + text[1] + text[2] + text[2] + text[3] + text[3];
      }
      if (/^#[0-9a-f]{6}$/.test(text)) return text;
      return null;
    }

    function mix(a, b, t) {
      const left = hexToRgb(a);
      const right = hexToRgb(b);
      if (left === null || right === null) return a;
      const ratio = Math.max(0, Math.min(1, t));
      return (
        "#" +
        hexByte(left.r + (right.r - left.r) * ratio) +
        hexByte(left.g + (right.g - left.g) * ratio) +
        hexByte(left.b + (right.b - left.b) * ratio)
      );
    }

    function alpha(value, a) {
      const rgb = hexToRgb(value);
      if (rgb === null) return value;
      return "#" + hexByte(rgb.r) + hexByte(rgb.g) + hexByte(rgb.b) + hexByte(a * 255);
    }

    function relLum(value) {
      const rgb = hexToRgb(value);
      if (rgb === null) return 0;
      const channel = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
    }

    function contrast(a, b) {
      const la = relLum(a);
      const lb = relLum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    /** Text color for content drawn on `background`: pick the readable extreme. */
    function readableOn(background) {
      const dark = "#0d1117";
      const light = "#ffffff";
      return contrast(background, dark) >= contrast(background, light) ? dark : light;
    }

    /** Resolve a CSS color (var chain / color-mix / rgb()) by probing a live element. */
    function probeColor(cssValue, fallback) {
      try {
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;background:" + cssValue;
        document.body.appendChild(probe);
        const computed = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return parseCssColor(computed) || fallback;
      } catch (error) {
        return fallback;
      }
    }

    function parseCssColor(value) {
      if (typeof value !== "string") return null;
      const text = value.trim().toLowerCase();
      if (text === "" || text === "transparent" || text === "none") return null;
      const direct = normalizeHex(text);
      if (direct !== null) return direct;
      let match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(
        text,
      );
      if (match !== null) {
        if (match[4] !== undefined) {
          const a = match[4].endsWith("%") ? Number(match[4].slice(0, -1)) / 100 : Number(match[4]);
          if (Number.isFinite(a) && a <= 0.02) return null;
        }
        return "#" + hexByte(match[1]) + hexByte(match[2]) + hexByte(match[3]);
      }
      match = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?/.exec(text);
      if (match !== null) {
        if (match[4] !== undefined && Number(match[4]) <= 0.02) return null;
        return (
          "#" +
          hexByte(Number(match[1]) * 255) +
          hexByte(Number(match[2]) * 255) +
          hexByte(Number(match[3]) * 255)
        );
      }
      return null;
    }

    /**
     * Resolve one alias token to a hex color. Custom properties are read from their
     * computed value on body first (the token stylesheet is the color authority);
     * a probe element resolves values that are not plain colors (e.g. color-mix()).
     */
    function readTokenColor(variable, fallback) {
      try {
        const raw = getComputedStyle(document.body).getPropertyValue(variable).trim();
        const parsed = parseCssColor(raw);
        report(
          "token " + variable + " raw=" + JSON.stringify(raw) + " parsed=" + String(parsed) +
            " bodyBg=" + getComputedStyle(document.body).backgroundColor,
        );
        if (parsed !== null) return parsed;
        const probed = probeColor("var(" + variable + ")", fallback);
        report("token " + variable + " probe -> " + probed);
        return probed;
      } catch (error) {
        return fallback;
      }
    }


    /* ------------------------------------------------------------------ *
     * palette store
     * ------------------------------------------------------------------ */

    /** Effective host colors, resolved once from the live token styles at activation. */
    const defaults = {
      accent: readTokenColor("--dsw-alias-state-business-primary", "#4176e6"),
      background: readTokenColor("--dsw-alias-bg-base", "#151517"),
      foreground: readTokenColor("--dsw-alias-label-primary", "#f9fafb"),
    };

    function readStored() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed = JSON.parse(raw);
        const stored = {};
        for (const kind of Object.keys(ROWS)) {
          const value = parsed !== null && typeof parsed === "object" ? normalizeHex(parsed[kind]) : null;
          stored[kind] = value;
        }
        return stored;
      } catch (error) {
        return {};
      }
    }

    function writeStored(state) {
      try {
        const payload = {};
        let any = false;
        for (const kind of Object.keys(ROWS)) {
          payload[kind] = state[kind] || null;
          if (payload[kind] !== null) any = true;
        }
        if (!any) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        /* storage may be unavailable */
      }
    }

    function createStore() {
      const state = { accent: null, background: null, foreground: null };
      const initial = readStored();
      for (const kind of Object.keys(ROWS)) state[kind] = initial[kind] || null;
      const listeners = new Set();
      const notify = () => {
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch (error) {
            report("store listener failed: " + String(error));
          }
        }
      };
      return {
        get: () => state,
        palette: () => ({
          accent: state.accent || defaults.accent,
          background: state.background || defaults.background,
          foreground: state.foreground || defaults.foreground,
        }),
        customized: (kind) => state[kind] !== null && state[kind] !== undefined,
        any: () => Boolean(state.accent || state.background || state.foreground),
        set: (kind, value) => {
          state[kind] = value === null ? null : normalizeHex(value);
          writeStored(state);
          notify();
        },
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    }

    const store = createStore();

    /* ------------------------------------------------------------------ *
     * diagnostics
     * ------------------------------------------------------------------ */

    /**
     * Opt-in trace, enabled with `window.__DSH_THEME_TUNER_DEBUG__ = true`.
     * Keeping the palette pipeline observable without a network channel is handy
     * when another installed skin fights over the same alias tokens.
     */
    function report(message) {
      try {
        if (window.__DSH_THEME_TUNER_DEBUG__ === true) {
          console.debug("[theme-tuner] " + message);
        }
      } catch (error) {
        /* diagnostics are best-effort */
      }
    }

    /* ------------------------------------------------------------------ *
     * token derivation
     * ------------------------------------------------------------------ */

    function deriveTokens(palette) {
      const bg = palette.background;
      const fg = palette.foreground;
      const accent = palette.accent;
      const mixBg = (t) => mix(bg, fg, t);
      const mixAccent = (t) => mix(bg, accent, t);

      const surfaces = {
        /* background-facing surfaces */
        "--dsw-alias-bg-base": bg,
        "--dsw-alias-bg-layer-1": mixBg(0.045),
        "--dsw-alias-bg-layer-2": mixBg(0.075),
        "--dsw-alias-bg-layer-3": mixBg(0.105),
        "--dsw-alias-bg-overlay": mixBg(0.1),
        "--dsw-alias-bg-module-platform": mixBg(0.06),
        "--dsw-alias-bg-multi-select": mixBg(0.06),
        "--dsw-alias-bg-document-preview": mixBg(0.04),
        "--dsw-alias-bg-skeleton": alpha(fg, 0.08),
        "--dsw-alias-settings-card-fill": mixBg(0.06),
        "--dsw-specific-sidebar-fill": mixBg(0.03),
        "--dsw-specific-input-major": mixBg(0.05),
        "--dsw-specific-login-input": mixBg(0.03),
        "--dsw-specific-selector": mixBg(0.06),
        "--dsw-specific-bubble": mixAccent(0.1),
        "--dsw-specific-bubble-highlight": mixAccent(0.16),
        "--dsw-specific-sidebar-nav-item-active": mixBg(0.07),
        "--dsw-specific-sidebar-nav-item-hover": mixBg(0.04),
        "--dsw-specific-tip": mixBg(0.06),
        "--dsw-alias-markdown-code-block": mixBg(0.05),
        "--dsw-alias-markdown-code-block-banner": mixBg(0.035),
        "--dsw-alias-markdown-inline-code": mixBg(0.07),
        "--dsw-alias-markdown-citation": mixBg(0.12),
        "--dsw-alias-markdown-placeholder": mixBg(0.1),
        "--dsw-alias-markdown-tag": mixBg(0.1),
        "--dsw-alias-markdown-code-segment-selected": mixBg(0.1),
        "--dsw-alias-markdown-code-segment-unselected": mixBg(0.03),
        "--dsw-menu-surface-fill": alpha(mixBg(0.06), 0.94),
        "--dsw-specific-menu": alpha(mixBg(0.06), 0.94),
        "--dsw-alias-menu-group-header-fill": alpha(mixBg(0.04), 0.96),
        "--dsw-alias-toast-bg": mixBg(0.14),
        "--dsw-alias-tooltip-bg": mixBg(0.16),
      };

      const text = {
        /* text, rules and neutral fills */
        "--dsw-alias-label-primary": fg,
        "--dsw-alias-label-secondary": mix(fg, bg, 0.32),
        "--dsw-alias-label-tertiary": mix(fg, bg, 0.46),
        "--dsw-alias-label-caption": mix(fg, bg, 0.56),
        "--dsw-alias-label-dimmed": mix(fg, bg, 0.72),
        "--dsw-alias-label-primary-dimmed": mix(fg, bg, 0.1),
        "--dsw-alias-label-document-preview": mix(fg, bg, 0.3),
        "--dsw-alias-settings-card-stroke": alpha(fg, 0.1),
        "--dsw-alias-menu-icon": mix(fg, bg, 0.12),
        "--dsw-alias-border-l1": alpha(fg, 0.06),
        "--dsw-alias-border-l2": alpha(fg, 0.12),
        "--dsw-alias-border-l2-darkmode-thin": alpha(fg, 0.08),
        "--dsw-alias-border-l3": alpha(fg, 0.16),
        "--dsw-alias-border-l4": alpha(fg, 0.2),
        "--dsw-alias-switch-thumb": fg,
        "--dsw-alias-interactive-bg-hover": alpha(fg, 0.08),
        "--dsw-alias-interactive-bg-active": alpha(fg, 0.13),
        "--dsw-alias-interactive-bg-hover-solid": mixBg(0.08),
        "--dsw-alias-button-floating-fill": mixBg(0.06),
        "--dsw-alias-button-floating-hover": mixBg(0.1),
        "--dsw-alias-button-elevated-fill": mixBg(0.07),
        "--dsw-alias-button-ghost-active-fill": alpha(fg, 0.1),
        "--dsw-alias-button-ghost-active-border": alpha(fg, 0.2),
        "--dsw-alias-state-idle-primary": mix(fg, bg, 0.55),
        "--dsw-alias-scrollbar-bg-l1": alpha(fg, 0.18),
        "--dsw-alias-scrollbar-bg-l2": alpha(fg, 0.26),
        "--dsw-alias-scrollbar-hover-l1": alpha(fg, 0.3),
        "--dsw-alias-scrollbar-hover-l2": alpha(fg, 0.38),
      };

      const accentTokens = {
        /* accent / brand */
        "--dsw-alias-brand-primary": accent,
        "--dsw-alias-brand-primary-invert": bg,
        "--dsw-alias-brand-text": accent,
        "--dsw-alias-state-business-primary": accent,
        "--dsw-alias-state-business-tertiary": mixAccent(0.16),
        "--dsw-alias-link": accent,
        "--dsw-alias-label-primary-bluish": accent,
        "--dsw-alias-label-primary-foreground": readableOn(accent),
        "--dsw-alias-bg-document-selection": alpha(accent, 0.3),
        "--dsw-specific-sidebar-nav-item-active-accent": mixAccent(0.18),
        "--dsw-alias-button-primary-fill": accent,
        "--dsw-alias-button-primary-hover": mix(accent, bg, 0.15),
        "--dsw-alias-button-primary-dimmed": mix(accent, bg, 0.45),
        "--dsw-alias-button-info-fill": accent,
        "--dsw-alias-button-info-hover": mix(accent, bg, 0.15),
        "--dsw-alias-interactive-bg-hover-accent": alpha(accent, 0.22),
        "--dsw-focus-ring-color": accent,
      };

      return { surfaces, text, accent: accentTokens };
    }

    /* ------------------------------------------------------------------ *
     * styles
     * ------------------------------------------------------------------ */

    const CSS = [
      ".tt-wrap{display:flex;flex-direction:column;gap:10px;padding:4px 0}",
      ".tt-row{display:flex;align-items:center;justify-content:space-between;gap:16px}",
      ".tt-text{display:flex;flex-direction:column;gap:2px;min-width:0}",
      ".tt-label{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}",
      ".tt-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
      ".tt-control{display:flex;align-items:center;flex:0 0 auto}",
      ".tt-pill{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px 0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;cursor:pointer}",
      ".tt-pill:hover{background:var(--dsw-alias-bg-layer-3)}",
      ".tt-pill[aria-expanded='true']{border-color:var(--dsw-alias-state-business-primary)}",
      ".tt-pill-mode{color:var(--dsw-alias-label-primary);font-weight:500;white-space:nowrap}",
      ".tt-chev{width:12px;height:12px;color:var(--dsw-alias-label-secondary);flex:0 0 auto;transition:transform .15s ease}",
      ".tt-pill[aria-expanded='true'] .tt-chev{transform:rotate(180deg)}",
      ".tt-dot{width:16px;height:16px;border-radius:50%;flex:0 0 auto;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l3)}",
      ".tt-hex{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-secondary);letter-spacing:.02em;text-transform:uppercase}",
      ".tt-panel{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}",
      ".tt-presets{display:flex;flex-wrap:wrap;gap:8px}",
      ".tt-swatch{width:26px;height:26px;padding:0;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);cursor:pointer;transition:transform .1s ease}",
      ".tt-swatch:hover{transform:scale(1.08)}",
      ".tt-swatch-on{box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-2),0 0 0 4px var(--dsw-alias-label-primary)}",
      ".tt-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".tt-hexbox{display:flex;align-items:center;gap:2px;height:30px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1)}",
      ".tt-hexbox:focus-within{border-color:var(--dsw-alias-state-business-primary)}",
      ".tt-hash{font-size:12px;color:var(--dsw-alias-label-tertiary)}",
      ".tt-input{width:76px;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}",
      ".tt-btn{height:30px;padding:0 12px;border-radius:6px;font-size:13px;line-height:20px;cursor:pointer;border:1px solid transparent;font-family:inherit}",
      ".tt-btn-primary{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-foreground);border-color:transparent}",
      ".tt-btn-primary:hover{filter:brightness(.94)}",
      ".tt-btn-ghost{background:transparent;border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}",
      ".tt-btn-ghost:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".tt-err{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}",
      ".tt-link{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
    ].join("\n");

    function injectStyle() {
      if (typeof document === "undefined") return () => {};
      const existing = document.querySelector("style[data-plugin-css='" + STYLE_ID + "']");
      if (existing !== null) existing.remove();
      const style = document.createElement("style");
      style.dataset.pluginCss = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
      return () => {
        try {
          style.remove();
        } catch (error) {
          /* ignore */
        }
      };
    }

    /* ------------------------------------------------------------------ *
     * row component
     * ------------------------------------------------------------------ */

    const CHEVRON = h(
      "svg",
      { className: "tt-chev", viewBox: "0 0 16 16", "aria-hidden": "true" },
      h("path", {
        d: "M4 6l4 4 4-4",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    );

    function ColorRow(props) {
      const kind = props.kind;
      const t = props.t || ((key) => key);
      const row = ROWS[kind];
      const [revision, setRevision] = React.useState(0);
      const [open, setOpen] = React.useState(false);
      const [draft, setDraft] = React.useState("");

      React.useEffect(
        () =>
          store.subscribe(() => {
            setRevision((value) => value + 1);
          }),
        [],
      );

      const current = store.customized(kind) ? store.get()[kind] : defaults[kind];
      const isCustom = store.customized(kind);
      const color = normalizeHex(current) || defaults[kind];

      const openPanel = () => {
        setDraft(color.replace("#", "").toUpperCase());
        setOpen((value) => !value);
      };

      const pick = (value) => {
        store.set(kind, value);
        setDraft(value.replace("#", "").toUpperCase());
        report("pick " + kind + "=" + value);
      };

      const commit = () => {
        const normalized = normalizeHex(draft.startsWith("#") ? draft : "#" + draft);
        if (normalized === null) {
          report("invalid hex for " + kind + ": " + draft);
          return;
        }
        store.set(kind, normalized);
        report("apply " + kind + "=" + normalized);
      };

      const reset = () => {
        store.set(kind, null);
        setDraft((defaults[kind] || color).replace("#", "").toUpperCase());
        report("reset " + kind);
      };

      const panel = open
        ? h(
            "div",
            { className: "tt-panel" },
            h(
              "div",
              { className: "tt-presets" },
              PRESETS[kind].map((preset) =>
                h("button", {
                  key: preset,
                  type: "button",
                  className: "tt-swatch" + (normalizeHex(preset) === color ? " tt-swatch-on" : ""),
                  style: { background: preset },
                  title: preset.toUpperCase(),
                  "aria-label": preset.toUpperCase(),
                  onClick: () => pick(preset),
                }),
              ),
            ),
            h(
              "div",
              { className: "tt-foot" },
              h(
                "label",
                { className: "tt-hexbox" },
                h("span", { className: "tt-hash" }, "#"),
                h("input", {
                  className: "tt-input",
                  value: draft,
                  maxLength: 7,
                  spellCheck: false,
                  autoComplete: "off",
                  "aria-label": t("panel.hexInput"),
                  onChange: (event) => setDraft(event.target.value.replace("#", "").toUpperCase()),
                  onKeyDown: (event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commit();
                    }
                  },
                }),
              ),
              h(
                "button",
                { type: "button", className: "tt-btn tt-btn-primary", onClick: commit },
                t("panel.apply"),
              ),
              h(
                "button",
                { type: "button", className: "tt-btn tt-btn-ghost", onClick: reset },
                t("panel.reset"),
              ),
              isCustom
                ? h("span", { className: "tt-link" }, t("panel.customized"))
                : h(
                    "span",
                    { className: "tt-link" },
                    t("panel.defaultValue") + " " + defaults[kind].toUpperCase(),
                  ),
            ),
          )
        : null;

      return h(
        "div",
        { className: "tt-wrap", "data-kind": kind, "data-revision": String(revision) },
        h(
          "div",
          { className: "tt-row" },
          h(
            "div",
            { className: "tt-text" },
            h("div", { className: "tt-label" }, t("row." + kind)),
            h("div", { className: "tt-hint" }, t("row." + kind + ".hint")),
          ),
          h(
            "div",
            { className: "tt-control" },
            h(
              "button",
              {
                type: "button",
                className: "tt-pill",
                "aria-expanded": open,
                "aria-label": t("row." + kind) + " " + current.toUpperCase(),
                onClick: openPanel,
              },
              h("span", { className: "tt-pill-mode" }, t(isCustom ? "mode.custom" : "mode.default")),
              h("span", { className: "tt-dot", style: { background: color } }),
              h("span", { className: "tt-hex" }, current.toUpperCase()),
              CHEVRON,
            ),
          ),
        ),
        panel,
      );
    }

    /* ------------------------------------------------------------------ *
     * palette application
     * ------------------------------------------------------------------ */

    let disposeLayer = null;
    let hardStyle = null;

    const HARD_STYLE_ID = "@local/dsh-theme-tuner/hard.css";

    /**
     * Third-party skin plugins may declare `!important` on the same alias tokens
     * (the installed video skin does exactly that on the background tokens). Inline
     * style written by the host presenter is weaker than a stylesheet `!important`
     * declaration, so the palette is mirrored into a plugin-owned stylesheet with
     * higher specificity (`html body` / `html body[data-ds-dark-theme]`).
     */
    function syncHardStyle(derived) {
      if (hardStyle === null) {
        document.body.setAttribute("data-ds-theme-tuner", "");
        hardStyle = document.createElement("style");
        hardStyle.dataset.pluginCss = HARD_STYLE_ID;
        hardStyle.dataset.plugin = "@local/dsh-theme-tuner";
        document.head.appendChild(hardStyle);
      }
      const vars = Object.entries(derived)
        .map(([name, value]) => name + ":" + value + " !important")
        .join(";");
      hardStyle.textContent =
        "html body[data-ds-theme-tuner][data-ds-theme-tuner]{" + vars + "}\n" +
        "html body[data-ds-theme-tuner][data-ds-theme-tuner][data-ds-dark-theme]{" + vars + "}\n";
    }

    function clearHardStyle() {
      try {
        document.body.removeAttribute("data-ds-theme-tuner");
      } catch (error) {
        /* ignore */
      }
      if (hardStyle === null) return;
      try {
        hardStyle.remove();
      } catch (error) {
        /* ignore */
      }
      hardStyle = null;
    }

    function syncOverrides(ctx) {
      try {
        if (!store.any()) {
          clearHardStyle();
          if (disposeLayer !== null) {
            try {
              disposeLayer();
            } catch (error) {
              /* ignore */
            }
            disposeLayer = null;
          }
          report("override cleared; host palette restored");
          return;
        }
        const palette = store.palette();
        const groups = deriveTokens(palette);
        /* Only touch the token groups whose color the user actually changed, so a
         * third-party skin's translucent surfaces (e.g. the video skin's
         * `rgba(21, 21, 23, 0.2)` background) survive an accent-only change. */
        const derived = {};
        if (store.customized("accent")) Object.assign(derived, groups.accent);
        if (store.customized("background")) Object.assign(derived, groups.surfaces);
        if (store.customized("foreground")) Object.assign(derived, groups.text);
        const overrides = {};
        for (const [name, value] of Object.entries(derived)) {
          overrides[name] = { light: value, dark: value };
        }
        disposeLayer = ctx.theme.overrideTokens(SOURCE, overrides);
        syncHardStyle(derived);
        report(
          "override registered tokens=" +
            Object.keys(overrides).length +
            " accent=" +
            palette.accent +
            " background=" +
            palette.background +
            " foreground=" +
            palette.foreground,
        );
      } catch (error) {
        report("override failed: " + String(error));
      }
    }

    /* ------------------------------------------------------------------ *
     * locale dictionaries
     * ------------------------------------------------------------------ */

    const zh = {
      "row.accent": "强调色",
      "row.accent.hint": "设置高亮显示和选中控件的颜色",
      "row.background": "背景",
      "row.background.hint": "设置应用内容的背景颜色",
      "row.foreground": "前景",
      "row.foreground.hint": "选择主要文本颜色",
      "mode.custom": "自定义",
      "mode.default": "默认",
      "panel.apply": "应用",
      "panel.reset": "恢复默认",
      "panel.hexInput": "十六进制颜色值",
      "panel.customized": "自定义配色已保存到本机浏览器",
      "panel.defaultValue": "当前默认 {value}",
    };

    const en = {
      "row.accent": "Accent color",
      "row.accent.hint": "Set the color of highlights and selected controls",
      "row.background": "Background",
      "row.background.hint": "Set the background color of app content",
      "row.foreground": "Foreground",
      "row.foreground.hint": "Choose the primary text color",
      "mode.custom": "Custom",
      "mode.default": "Default",
      "panel.apply": "Apply",
      "panel.reset": "Reset",
      "panel.hexInput": "Hex color value",
      "panel.customized": "Custom palette saved in this browser",
      "panel.defaultValue": "Default {value}",
    };

    /* ------------------------------------------------------------------ *
     * plugin body
     * ------------------------------------------------------------------ */

    const inject = ["slots", "locale", "theme"];

    function apply(ctx) {
      /* Drop styles a previous module generation left behind (HMR replacement). */
      for (const stale of document.querySelectorAll(
        'style[data-plugin-css="' + HARD_STYLE_ID + '"]',
      )) {
        stale.remove();
      }
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "theme-tuner: dictionaries");
      ctx.effect(() => injectStyle(), "theme-tuner: styles");

      report(
        "client activate; defaults accent=" +
          defaults.accent +
          " background=" +
          defaults.background +
          " foreground=" +
          defaults.foreground +
          " stored=" +
          JSON.stringify(store.get()),
      );

      for (const kind of Object.keys(ROWS)) {
        ctx.slots.inject("settings.general.item", () =>
          ctx.slots.register(
            {
              name: "settings.general.item",
              id: ROWS[kind].id,
              order: ROWS[kind].order,
              locale: NS,
              inject: () => ({ kind }),
            },
            ColorRow,
          ),
        );
      }

      ctx.effect(() => {
        syncOverrides(ctx);
        const off = store.subscribe(() => syncOverrides(ctx));
        return () => {
          off();
          if (disposeLayer !== null) {
            try {
              disposeLayer();
            } catch (error) {
              /* ignore */
            }
            disposeLayer = null;
          }
        };
      }, "theme-tuner: palette overrides");

      ctx.effect(
        () =>
          ctx.on("theme/change", () => {
            /* the composed snapshot already folds this plugin's layer; report for the audit log */
            report("theme/change revision=" + ctx.theme.getTheme().revision);
          }),
        "theme-tuner: theme audit",
      );

      window.__DSH_THEME_TUNER__ = {
        apply: () => syncOverrides(ctx),
        store,
        defaults,
        deriveTokens,
        version: "0.1.0",
      };
    }

    return { inject, apply };
  },
});
