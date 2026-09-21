import { useMemo, useState } from "react";
import {
  PRESETS, PRESET_KEYS, PresetKey, DISCLAIMER, ACTIVITY_LEVELS, ActivityLevel, Goal, Targets,
  computeTargets, ageFromBirthYear, feetInchesToCm, lbsToKg, round,
  localDateString, Profile, ProfileInput,
} from "@nutrition/shared";
import { client } from "./api";
import { ApiError } from "./session";
import { Shell } from "./AuthScreens";

// Where a new account goes before it can use the app: who you are, which plan,
// and the numbers that come out of it. Targets are computed LOCALLY with the
// shared package so the review screen updates as you type; the server
// recomputes on save, and its answer is what is stored.

const C = { bg: "#F8F5F0", primary: "#3D5A4C", accent: "#C4714A", text: "#2C2C2C", muted: "#8A8A8A", border: "#E8E4DC", danger: "#D64545" };

const field: React.CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: 10, border: `1.5px solid ${C.border}`,
  fontSize: 15, background: C.bg, fontFamily: "inherit", minWidth: 0,
};
const primaryButton: React.CSSProperties = {
  width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.primary, color: "white",
  fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
const linkButton: React.CSSProperties = {
  background: "none", border: "none", color: C.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 8, fontFamily: "inherit",
};
const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6, display: "block" };

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary — desk job, little exercise",
  light: "Light — exercise 1–3 days a week",
  moderate: "Moderate — exercise 3–5 days a week",
  active: "Active — hard exercise 6–7 days a week",
  very_active: "Very active — physical job, or training twice a day",
};
const GOAL_LABELS: Record<Goal, string> = { lose: "Lose weight", maintain: "Stay where I am", gain: "Gain weight" };

type Step = "about" | "plan" | "review";

/** What the form holds while it is being filled in: strings, because inputs are strings. */
interface Draft {
  units: "imperial" | "metric";
  sex: "female" | "male" | "";
  birthYear: string;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weight: string; // in the chosen units
  activity: ActivityLevel;
  goal: Goal;
  weeklyRate: string; // in the chosen units, per week
}

const thisYear = new Date().getFullYear();

const numberOr = (s: string, fallback = NaN) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
};

/** The draft as metric numbers, or null for anything not yet filled in. */
function toMetric(d: Draft) {
  const imperial = d.units === "imperial";
  const weight = numberOr(d.weight);
  const rate = numberOr(d.weeklyRate, 0);
  const heightCm = imperial
    ? d.heightFt === "" && d.heightIn === "" ? NaN : feetInchesToCm(numberOr(d.heightFt, 0), numberOr(d.heightIn, 0))
    : numberOr(d.heightCm);
  return {
    sex: d.sex === "" ? null : d.sex,
    birth_year: d.birthYear === "" ? NaN : numberOr(d.birthYear),
    height_cm: heightCm,
    weight_kg: imperial ? (Number.isFinite(weight) ? lbsToKg(weight) : NaN) : weight,
    activity: d.activity,
    goal: d.goal,
    weekly_rate_kg: imperial ? lbsToKg(rate) : rate,
  };
}

export function Onboarding({ name, onDone }: { name: string; onDone: (profile: Profile) => void }) {
  const [step, setStep] = useState<Step>("about");
  const [draft, setDraft] = useState<Draft>({
    units: "imperial", sex: "", birthYear: "", heightCm: "", heightFt: "", heightIn: "",
    weight: "", activity: "sedentary", goal: "maintain", weeklyRate: "1",
  });
  const [preset, setPreset] = useState<PresetKey>("balanced");
  const [edited, setEdited] = useState<Targets | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const metric = toMetric(draft);
  const imperial = draft.units === "imperial";

  const aboutComplete =
    Number.isFinite(metric.weight_kg) &&
    (preset === "custom" || (Number.isFinite(metric.birth_year) && Number.isFinite(metric.height_cm)));

  // Recomputed on every keystroke. Pure functions, no network.
  const computed = useMemo(() => {
    if (preset === "custom" || !aboutComplete) return null;
    try {
      return computeTargets(preset, {
        sex: metric.sex, age: ageFromBirthYear(metric.birth_year), height_cm: metric.height_cm,
        weight_kg: metric.weight_kg, activity: metric.activity, goal: metric.goal,
        weekly_rate_kg: metric.goal === "maintain" ? 0 : metric.weekly_rate_kg,
      });
    } catch {
      return null; // out of range: the review step explains, and the server is the final word
    }
  }, [preset, aboutComplete, JSON.stringify(metric)]);

  const BLANK_CUSTOM: Targets = { calories: 1800, protein_g: 100, carbs_g: 180, carbs_mode: "total", fat_g: 60, fiber_g: 28 };
  const targets = edited ?? computed?.targets ?? BLANK_CUSTOM;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body: ProfileInput = {
        units: draft.units,
        sex: metric.sex,
        weight_kg: round(metric.weight_kg, 2),
        activity: metric.activity,
        goal: metric.goal,
        weekly_rate_kg: metric.goal === "maintain" ? 0 : round(metric.weekly_rate_kg, 3),
        preset_key: preset,
        // The client's local day, so the entered weight can start the chart.
        local_date: localDateString(),
        ...(preset === "custom" ? {} : { birth_year: metric.birth_year, height_cm: round(metric.height_cm, 2) }),
        ...(edited || preset === "custom" ? { targets } : {}),
      };
      const { profile } = await client.profile.save(body);
      onDone(profile);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Check your connection and try again.");
      setSaving(false);
    }
  };

  // ── Step 1: about you ──────────────────────────────────────────────────────

  if (step === "about") {
    return (
      <Shell title={`Welcome${name ? `, ${name}` : ""}`} subtitle="A few details, so your targets fit you.">
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {(["imperial", "metric"] as const).map((u) => (
            <button
              key={u}
              onClick={() => set("units", u)}
              style={{ flex: 1, padding: "9px 4px", borderRadius: 9, border: `1.5px solid ${draft.units === u ? C.primary : C.border}`, background: draft.units === u ? C.primary : "white", color: draft.units === u ? "white" : C.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              {u === "imperial" ? "lbs / ft" : "kg / cm"}
            </button>
          ))}
        </div>

        <label style={label} htmlFor="ob-weight">Current weight ({imperial ? "lbs" : "kg"})</label>
        <input id="ob-weight" style={{ ...field, marginBottom: 14 }} type="number" inputMode="decimal" value={draft.weight} onChange={(e) => set("weight", e.target.value)} />

        <label style={label}>Height</label>
        {imperial ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input aria-label="Height, feet" placeholder="ft" style={field} type="number" value={draft.heightFt} onChange={(e) => set("heightFt", e.target.value)} />
            <input aria-label="Height, inches" placeholder="in" style={field} type="number" value={draft.heightIn} onChange={(e) => set("heightIn", e.target.value)} />
          </div>
        ) : (
          <input aria-label="Height in centimetres" style={{ ...field, marginBottom: 14 }} type="number" value={draft.heightCm} onChange={(e) => set("heightCm", e.target.value)} />
        )}

        <label style={label} htmlFor="ob-year">Year of birth</label>
        <input id="ob-year" style={{ ...field, marginBottom: 14 }} type="number" inputMode="numeric" placeholder={String(thisYear - 40)} value={draft.birthYear} onChange={(e) => set("birthYear", e.target.value)} />

        <label style={label} htmlFor="ob-sex">Sex</label>
        <select id="ob-sex" style={{ ...field, marginBottom: 4 }} value={draft.sex} onChange={(e) => set("sex", e.target.value as Draft["sex"])}>
          <option value="">Prefer not to say</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.4 }}>
          Used by the energy formula and the safe calorie minimum. If you skip it we use the cautious figure.
        </div>

        <label style={label} htmlFor="ob-activity">Everyday activity</label>
        <select id="ob-activity" style={{ ...field, marginBottom: 14 }} value={draft.activity} onChange={(e) => set("activity", e.target.value as ActivityLevel)}>
          {ACTIVITY_LEVELS.map((a) => <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>)}
        </select>

        <label style={label} htmlFor="ob-goal">Goal</label>
        <select id="ob-goal" style={{ ...field, marginBottom: draft.goal === "maintain" ? 18 : 14 }} value={draft.goal} onChange={(e) => set("goal", e.target.value as Goal)}>
          {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
        </select>

        {draft.goal !== "maintain" && (
          <>
            <label style={label} htmlFor="ob-rate">{draft.goal === "lose" ? "Lose" : "Gain"} per week ({imperial ? "lbs" : "kg"})</label>
            <input id="ob-rate" style={{ ...field, marginBottom: 18 }} type="number" inputMode="decimal" step="0.25" value={draft.weeklyRate} onChange={(e) => set("weeklyRate", e.target.value)} />
          </>
        )}

        <button style={{ ...primaryButton, opacity: Number.isFinite(metric.weight_kg) ? 1 : 0.5 }} disabled={!Number.isFinite(metric.weight_kg)} onClick={() => setStep("plan")}>
          Next: choose a plan
        </button>
      </Shell>
    );
  }

  // ── Step 2: choose a plan ──────────────────────────────────────────────────

  if (step === "plan") {
    return (
      <Shell title="Choose a plan" subtitle="This sets your starting targets. You can change any of them.">
        {PRESET_KEYS.map((key) => {
          const p = PRESETS[key];
          const chosen = preset === key;
          return (
            <button
              key={key}
              onClick={() => { setPreset(key); setEdited(null); }}
              aria-pressed={chosen}
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 10, padding: 14, borderRadius: 12, cursor: "pointer", fontFamily: "inherit", background: chosen ? "#F1F5F2" : "white", border: `1.5px solid ${chosen ? C.primary : C.border}` }}
            >
              <div style={{ fontSize: 14.5, fontWeight: 700, color: chosen ? C.primary : C.text }}>{p.name}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>{p.summary}</div>
              {chosen && p.whoFor && <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45 }}><strong>Who it's for:</strong> {p.whoFor}</div>}
              {chosen && p.notFor.length > 0 && (
                <div style={{ fontSize: 11.5, marginTop: 8, color: C.danger, lineHeight: 1.45 }}>
                  <strong>Not for:</strong> {p.notFor.join(" · ")}
                </div>
              )}
            </button>
          );
        })}

        {preset !== "custom" && !aboutComplete && (
          <div role="alert" style={{ background: "#FFF8EC", color: "#8A6A20", padding: "10px 12px", borderRadius: 10, fontSize: 12.5, margin: "4px 0 12px", lineHeight: 1.45 }}>
            To calculate targets this plan needs your height and year of birth. Go back and add them, or choose Custom and enter your own numbers.
          </div>
        )}

        <button style={{ ...primaryButton, opacity: preset === "custom" || aboutComplete ? 1 : 0.5 }} disabled={preset !== "custom" && !aboutComplete} onClick={() => setStep("review")}>
          Next: your targets
        </button>
        <div style={{ textAlign: "center", marginTop: 6 }}><button style={linkButton} onClick={() => setStep("about")}>Back</button></div>
      </Shell>
    );
  }

  // ── Step 3: review ─────────────────────────────────────────────────────────

  const e = computed?.explanation;
  const notes = [
    e?.floor_applied && `Your calories are set by the safe minimum of ${e.calorie_floor} a day, not by your goal.`,
    e?.rate_capped && "We've eased your pace to a rate that's safe to keep up.",
    e?.ceiling_applied && "These are estimates at the edge of what the formulas cover; adjust them to suit you.",
    e?.protein_capped && "Protein is held at the top of the usual range for your calories.",
  ].filter(Boolean) as string[];

  const editTarget = (key: keyof Targets, value: string) =>
    setEdited({ ...targets, [key]: key === "calories" ? Math.round(numberOr(value, 0)) : numberOr(value, 0) });

  const rows: [keyof Targets, string, string][] = [
    ["calories", "Calories", "net per day"],
    ["protein_g", "Protein", "g"],
    ["carbs_g", targets.carbs_mode === "net" ? "Net carbs" : "Carbs", "g"],
    ["fat_g", "Fat", "g"],
    ["fiber_g", "Fibre", "g"],
  ];

  return (
    <Shell title="Your daily targets" subtitle={PRESETS[preset].name}>
      {error && <div role="alert" style={{ background: "#FCEBEB", color: C.danger, padding: "10px 12px", borderRadius: 10, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {rows.map(([key, name, unit]) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <label htmlFor={`t-${key}`} style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{name}</label>
          <input id={`t-${key}`} style={{ ...field, width: 96, flex: "none", textAlign: "right" }} type="number" inputMode="decimal" value={String(targets[key])} onChange={(ev) => editTarget(key, ev.target.value)} />
          <span style={{ fontSize: 12, color: C.muted, width: 62 }}>{unit}</span>
        </div>
      ))}

      {edited && (
        <button style={{ ...linkButton, padding: "2px 0", marginBottom: 6 }} onClick={() => setEdited(null)}>
          Reset to the plan's numbers
        </button>
      )}

      {e && (
        <div style={{ background: C.bg, borderRadius: 10, padding: "11px 13px", fontSize: 11.5, color: C.muted, lineHeight: 1.6, margin: "8px 0 12px" }}>
          At rest you burn about {e.bmr} calories a day, and about {e.maintenance} with your everyday activity.
          {e.goal_adjustment !== 0 && ` Your goal ${e.goal_adjustment < 0 ? "takes off" : "adds"} about ${Math.abs(e.goal_adjustment)} a day.`}
          {" "}Exercise you log is added back on top.
          {notes.map((n) => <div key={n} style={{ marginTop: 6, color: C.text }}>{n}</div>)}
        </div>
      )}

      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>{DISCLAIMER}</div>

      <button style={primaryButton} disabled={saving} onClick={save}>{saving ? "Saving…" : "Start tracking"}</button>
      <div style={{ textAlign: "center", marginTop: 6 }}><button style={linkButton} onClick={() => setStep("plan")}>Back</button></div>
    </Shell>
  );
}
