import { useState, useEffect, useCallback } from "react";
import { dayTotals, netCarbs as netCarbsOf, remainingCalories, scaleMacros, round as r, PRESETS, Profile } from "@nutrition/shared";
import { api, FoodEntry, ExerciseEntry, NewFoodEntry, NewExerciseEntry, Food, Exercise, MealPlan } from "./api";
import { daysAgo, useToday } from "./date";
import { AccountPanel } from "./AuthScreens";
import type { User } from "./session";

const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
type Meal = typeof MEALS[number];

const C = {
  bg: "#F8F5F0", card: "#FFFFFF", primary: "#3D5A4C", accent: "#C4714A",
  gold: "#C9963A", text: "#2C2C2C", muted: "#8A8A8A", border: "#E8E4DC",
  protein: "#C4714A", carbs: "#C9963A", fat: "#5E9478", fiber: "#7B6BB0",
};

const EMPTY_FOOD = { name: "", unit: "g", defaultServing: "100", cal: "", protein: "", carbs: "", fat: "", fiber: "" };

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Component ─────────────────────────────────────────────────────────────────
export default function NutriTracker({ user, profile }: { user: User; profile: Profile; onProfileChanged?: () => void }) {
  const [accountOpen, setAccountOpen] = useState(false);

  // Every target comes from this user's own profile (set during onboarding).
  const { calories: DAILY_CAL, protein_g: PROTEIN_TARGET, carbs_g: CARBS_TARGET, fat_g: FAT_TARGET, fiber_g: FIBER_TARGET, carbs_mode } = profile.targets;
  const carbsLabel = carbs_mode === "net" ? "Net Carbs" : "Carbs";
  const date = useToday();
  const [tab, setTab] = useState("dashboard");
  const [foodLog, setFoodLog] = useState<FoodEntry[]>([]);
  const [exerciseLog, setExerciseLog] = useState<ExerciseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [libSearch, setLibSearch] = useState("");
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servingAmount, setServingAmount] = useState("");
  const [selectedMeal, setSelectedMeal] = useState<Meal>("Breakfast");
  const [exerciseName, setExerciseName] = useState("");
  const [exerciseDuration, setExerciseDuration] = useState("");
  const [customCal, setCustomCal] = useState("");
  const [toast, setToast] = useState("");
  const [mealFilter, setMealFilter] = useState("All");
  const [historyDate, setHistoryDate] = useState(date);
  const [historyFood, setHistoryFood] = useState<FoodEntry[]>([]);
  const [historyEx, setHistoryEx] = useState<ExerciseEntry[]>([]);
  const [historyDates, setHistoryDates] = useState<string[]>([]);
  const [apiError, setApiError] = useState(false);

  // The catalog lives in the database and is fetched once per session.
  const [foods, setFoods] = useState<Food[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [newFood, setNewFood] = useState<typeof EMPTY_FOOD | null>(null);

  useEffect(() => {
    api.catalog.load()
      .then(c => { setFoods(c.foods); setExercises(c.exercises); setMealPlans(c.mealPlans); })
      .catch(() => setApiError(true));
  }, []);

  const saveCustomFood = async () => {
    if (!newFood || !newFood.name.trim()) return;
    const num = (v: string) => parseFloat(v) || 0;
    try {
      const saved = await api.catalog.addFood({
        name: newFood.name, unit: newFood.unit || "g", defaultServing: num(newFood.defaultServing) || 100, category: "My Foods",
        cal: num(newFood.cal), protein: num(newFood.protein), carbs: num(newFood.carbs), fat: num(newFood.fat), fiber: num(newFood.fiber),
      });
      setFoods(p => [...p, saved]);
      setNewFood(null);
      flash("Food saved");
    } catch (e) { flash(e instanceof Error ? e.message : "Error saving food"); }
  };

  const deleteCustomFood = async (id: number) => {
    try { await api.catalog.deleteFood(id); setFoods(p => p.filter(f => f.id !== id)); } catch { flash("Error deleting food"); }
  };

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  // Load today's data
  const loadToday = useCallback(async () => {
    setLoading(true);
    try {
      const [food, ex] = await Promise.all([api.food.getByDate(date), api.exercise.getByDate(date)]);
      setFoodLog(food);
      setExerciseLog(ex);
      setApiError(false);
    } catch {
      setApiError(true);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadToday(); }, [loadToday]);

  // Load history
  useEffect(() => {
    if (tab !== "history") return;
    const load = async () => {
      try {
        const end = date;
        const start = daysAgo(30);
        const summaries = await api.summary.getRange(start, end);
        setHistoryDates([date, ...summaries.map(s => s.date).filter(d => d !== date)]);
      } catch {}
    };
    load();
  }, [tab, date]);

  useEffect(() => {
    if (tab !== "history") return;
    const load = async () => {
      try {
        if (historyDate === date) { setHistoryFood(foodLog); setHistoryEx(exerciseLog); return; }
        const [food, ex] = await Promise.all([api.food.getByDate(historyDate), api.exercise.getByDate(historyDate)]);
        setHistoryFood(food); setHistoryEx(ex);
      } catch {}
    };
    load();
  }, [historyDate, tab, date, foodLog, exerciseLog]);

  // Totals
  const { cal: totalCal, protein: totalProtein, carbs: totalCarbs, fat: totalFat, fiber: totalFiber, netCarbs, exerciseCal: exCal, netCal } = dayTotals(foodLog, exerciseLog);
  const remaining = remainingCalories(DAILY_CAL, netCal);
  const isOver = netCal > DAILY_CAL;

  const addFood = async () => {
    if (!selectedFood || !servingAmount) return;
    const entry: NewFoodEntry = {
      date, meal: selectedMeal, food_name: selectedFood.name,
      amount: `${servingAmount} ${selectedFood.unit}`,
      ...scaleMacros(selectedFood, parseFloat(servingAmount), selectedFood.defaultServing),
    };
    try {
      const saved = await api.food.add(entry);
      setFoodLog(p => [...p, saved]);
      flash("Added to " + selectedMeal);
      setSelectedFood(null); setServingAmount(""); setSearch(""); setTab("dashboard");
    } catch { flash("Error saving — check connection"); }
  };

  const deleteFood = async (id: number) => {
    try { await api.food.delete(id); setFoodLog(p => p.filter(e => e.id !== id)); } catch { flash("Error deleting entry"); }
  };

  const addExercise = async () => {
    if (!exerciseName || !exerciseDuration) return;
    const lib = exercises.find(e => e.name === exerciseName);
    const cal = lib ? Math.round(lib.calPerMin * parseFloat(exerciseDuration)) : parseInt(customCal) || 0;
    const entry: NewExerciseEntry = { date, name: exerciseName, duration: `${exerciseDuration} min`, cal };
    try {
      const saved = await api.exercise.add(entry);
      setExerciseLog(p => [...p, saved]);
      flash("Exercise logged");
      setExerciseName(""); setExerciseDuration(""); setCustomCal(""); setTab("dashboard");
    } catch { flash("Error saving exercise"); }
  };

  const deleteExercise = async (id: number) => {
    try { await api.exercise.delete(id); setExerciseLog(p => p.filter(e => e.id !== id)); } catch { flash("Error deleting entry"); }
  };

  const logRecipe = async (recipe: MealPlan) => {
    const entries: NewFoodEntry[] = recipe.items.map(item => {
      const food = foods.find(f => f.id === item.foodId)!;
      return { date, meal: recipe.mealType, food_name: food.name, amount: `${item.servingAmount} ${food.unit}`, ...scaleMacros(food, item.servingAmount, food.defaultServing) };
    });
    try {
      const saved = await api.food.addBatch(entries);
      setFoodLog(p => [...p, ...saved]);
      flash(`${recipe.name} logged`);
      setTab("dashboard");
    } catch { flash("Error logging recipe"); }
  };

  const filteredFoods = foods.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  const filteredLib = foods.filter(f => f.name.toLowerCase().includes(libSearch.toLowerCase()));
  const filteredRecipes = mealFilter === "All" ? mealPlans : mealPlans.filter(r => r.mealType === mealFilter);

  // Sub-components
  const MacroBar = ({ label, current, target, color }: { label: string; current: number; target: number; color: string }) => {
    const pct = Math.min(100, (current / target) * 100);
    const over = current > target;
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>{label}</span>
          <span style={{ color: over ? "#D64545" : C.muted }}>{r(current)}g <span style={{ color: C.border }}>/ {target}g</span></span>
        </div>
        <div style={{ height: 9, background: C.border, borderRadius: 5, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: over ? "#D64545" : color, borderRadius: 5, transition: "width 0.4s" }} />
        </div>
      </div>
    );
  };

  const BarAnalysis = ({ label, actual, target, color, unit = "g" }: { label: string; actual: number; target: number; color: string; unit?: string }) => {
    const pct = target > 0 ? (actual / target) * 100 : 0;
    const displayPct = Math.min(100, Math.max(0, pct));
    const status = pct > 110 ? "over" : pct < 75 ? "under" : "on target";
    const statusColor = pct > 110 ? "#D64545" : pct < 75 ? C.gold : "#5E9478";
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, textTransform: "uppercase", letterSpacing: "0.07em" }}>{Math.round(pct)}% · {status}</span>
        </div>
        <div style={{ position: "relative", height: 26, background: C.border, borderRadius: 7, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${displayPct}%`, background: pct > 110 ? "#D64545" : color }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", fontSize: 11, fontWeight: 700, color: displayPct > 40 ? "white" : C.text }}>
            <span>{Math.round(actual)}{unit}</span>
            <span style={{ opacity: 0.8 }}>/ {target}{unit}</span>
          </div>
        </div>
      </div>
    );
  };

  const circ = 2 * Math.PI * 68;
  const ringOffset = circ * (1 - Math.min(1, netCal / DAILY_CAL));

  return (
    <div style={{ background: C.bg, height: "100vh", fontFamily: "'DM Sans', sans-serif", color: C.text, maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select, button { font-family: 'DM Sans', sans-serif; }
        @keyframes slideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .flash { animation: slideIn 0.2s ease; }
      `}</style>

      {toast && <div className="flash" style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: C.primary, color: "white", padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>✓ {toast}</div>}

      {accountOpen && <AccountPanel onClose={() => setAccountOpen(false)} />}

      {apiError && <div style={{ background: "#D64545", color: "white", padding: "10px 16px", fontSize: 12, textAlign: "center" }}>⚠ Cannot reach API — check your connection or server status</div>}

      {/* Header */}
      <div style={{ background: C.primary, padding: "22px 20px 0", color: "white", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 21, marginBottom: 2 }}>{user.name ? `${user.name}'s Nutrition` : "Nutrition"}</div>
          <button aria-label="Account" onClick={() => setAccountOpen(true)} style={{ background: "rgba(255,255,255,0.18)", border: "none", color: "white", width: 34, height: 34, borderRadius: 17, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {(user.name || user.email).charAt(0).toUpperCase()}
          </button>
        </div>
        <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 18 }}>{new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}</div>
        <div style={{ display: "flex", gap: 0, background: "rgba(0,0,0,0.15)", borderRadius: 12, padding: "12px 8px", marginBottom: 16 }}>
          {[{ label: "Goal", val: DAILY_CAL, color: "white" }, { label: "Food", val: Math.round(totalCal), color: "white" }, { label: "Exercise", val: Math.round(exCal), color: "#FBCFA8" }, { label: "Remaining", val: Math.abs(Math.round(remaining)), color: isOver ? "#FF9B9B" : "#A8FBCA" }].map(({ label, val, color }, i) => (
            <div key={label} style={{ flex: 1, textAlign: "center", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.15)" : "none" }}>
              <div style={{ fontSize: 19, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "white", borderBottom: `1px solid ${C.border}`, flexShrink: 0, overflowX: "auto" }}>
        {[{ id: "dashboard", icon: "◈", label: "Today" }, { id: "food", icon: "+", label: "Food" }, { id: "exercise", icon: "♦", label: "Exercise" }, { id: "meals", icon: "✦", label: "Meals" }, { id: "history", icon: "⟲", label: "History" }, { id: "library", icon: "☰", label: "Library" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, minWidth: 56, padding: "12px 4px 10px", border: "none", background: "none", fontSize: 11, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? C.primary : C.muted, borderBottom: `2.5px solid ${tab === t.id ? C.primary : "transparent"}`, cursor: "pointer" }}>
            <div style={{ fontSize: 14, marginBottom: 2 }}>{t.icon}</div>{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as any, padding: "18px 16px 200px" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            {loading && <div style={{ textAlign: "center", color: C.muted, padding: 32, fontSize: 14 }}>Loading...</div>}
            {!loading && (
              <>
                <div style={{ background: "white", borderRadius: 18, padding: "24px 20px 20px", marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)", textAlign: "center" }}>
                  <div style={{ position: "relative", width: 176, height: 176, margin: "0 auto 8px" }}>
                    <svg width="176" height="176" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="88" cy="88" r="68" fill="none" stroke={C.border} strokeWidth="13" />
                      <circle cx="88" cy="88" r="68" fill="none" stroke={isOver ? "#D64545" : C.primary} strokeWidth="13" strokeDasharray={circ} strokeDashoffset={ringOffset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
                    </svg>
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                      <div style={{ fontSize: 34, fontWeight: 700, color: isOver ? "#D64545" : C.primary, fontFamily: "'DM Serif Display', serif", lineHeight: 1 }}>{Math.abs(Math.round(remaining))}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{isOver ? "over goal" : "remaining"}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>{Math.round(totalCal)} eaten · {Math.round(exCal)} burned · {Math.round(netCal)} net</div>
                </div>

                <div style={{ background: "white", borderRadius: 18, padding: 20, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, marginBottom: 16 }}>Macronutrients</div>
                  <MacroBar label="Protein" current={totalProtein} target={PROTEIN_TARGET} color={C.protein} />
                  <MacroBar label={carbsLabel} current={carbs_mode === "net" ? netCarbs : totalCarbs} target={CARBS_TARGET} color={C.gold} />
                  <MacroBar label="Fat" current={totalFat} target={FAT_TARGET} color={C.fat} />
                  <MacroBar label="Fibre" current={totalFiber} target={FIBER_TARGET} color={C.fiber} />
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 10, textAlign: "center" }}>Total carbs: {r(totalCarbs)}g − {r(totalFiber)}g fibre = {r(netCarbs)}g net</div>
                </div>

                {MEALS.map(meal => {
                  const entries = foodLog.filter(e => e.meal === meal);
                  if (!entries.length) return null;
                  const mealCal = entries.reduce((s, e) => s + e.cal, 0);
                  return (
                    <div key={meal} style={{ background: "white", borderRadius: 18, padding: 16, marginBottom: 12, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, color: C.primary }}>{meal}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{mealCal} cal</span>
                      </div>
                      {entries.map(e => (
                        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 6px", borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{e.food_name}</div>
                            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{e.amount} · P:{e.protein}g · NC:{r(netCarbsOf(e.carbs, e.fiber))}g · F:{e.fat}g</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700 }}>{e.cal}</span>
                            <button onClick={() => e.id && deleteFood(e.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" }}>×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}

                {exerciseLog.length > 0 && (
                  <div style={{ background: "white", borderRadius: 18, padding: 16, marginBottom: 12, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, color: C.accent }}>Exercise</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>-{exCal} cal</span>
                    </div>
                    {exerciseLog.map(e => (
                      <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 6px", borderBottom: `1px solid ${C.border}` }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{e.name}</div>
                          <div style={{ fontSize: 11.5, color: C.muted }}>{e.duration}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 700, color: C.accent }}>−{e.cal}</span>
                          <button onClick={() => e.id && deleteExercise(e.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {foodLog.length === 0 && exerciseLog.length === 0 && (
                  <div style={{ textAlign: "center", padding: "48px 20px", color: C.muted }}>
                    <div style={{ fontSize: 44, marginBottom: 12 }}>🥗</div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>Nothing logged yet today</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Tap Food or Exercise to get started</div>
                  </div>
                )}
                <div style={{ textAlign: "center", padding: "16px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                  {DAILY_CAL} cal · {PROTEIN_TARGET}g protein · {CARBS_TARGET}g {carbs_mode === "net" ? "net " : ""}carbs · {FAT_TARGET}g fat · {FIBER_TARGET}g fibre<br />{PRESETS[profile.preset_key].name}
                </div>
              </>
            )}
          </div>
        )}

        {/* FOOD */}
        {tab === "food" && (
          <div>
            <div style={{ background: "white", borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10 }}>Add to</div>
              <div style={{ display: "flex", gap: 7 }}>
                {MEALS.map(m => (
                  <button key={m} onClick={() => setSelectedMeal(m)} style={{ flex: 1, padding: "9px 2px", borderRadius: 9, border: `1.5px solid ${selectedMeal === m ? C.primary : C.border}`, background: selectedMeal === m ? C.primary : "white", color: selectedMeal === m ? "white" : C.text, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{m}</button>
                ))}
              </div>
            </div>
            <div style={{ background: "white", borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
              <input type="text" placeholder="🔍  Search foods..." value={search} onChange={e => { setSearch(e.target.value); setSelectedFood(null); }} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, background: C.bg }} />
              {search && !selectedFood && (
                <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto" }}>
                  {filteredFoods.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: 8 }}>No foods found</div>}
                  {filteredFoods.map(f => (
                    <div key={f.id} onClick={() => { setSelectedFood(f); setServingAmount(String(f.defaultServing)); }} style={{ padding: "11px 6px", borderRadius: 8, cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{f.name}</div>
                      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{f.cal} cal · P:{f.protein}g NC:{netCarbsOf(f.carbs, f.fiber)}g F:{f.fat}g Fib:{f.fiber}g</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedFood && (
              <div style={{ background: "white", borderRadius: 18, padding: 18, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, marginBottom: 4 }}>{selectedFood.name}</div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Per {selectedFood.defaultServing} {selectedFood.unit}: {selectedFood.cal} cal · P:{selectedFood.protein}g · NC:{netCarbsOf(selectedFood.carbs, selectedFood.fiber)}g · F:{selectedFood.fat}g · Fib:{selectedFood.fiber}g</div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>Amount ({selectedFood.unit})</label>
                <input type="number" value={servingAmount} onChange={e => setServingAmount(e.target.value)} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 15, marginBottom: 12 }} />
                {servingAmount && !isNaN(parseFloat(servingAmount)) && (() => {
                  const m = parseFloat(servingAmount) / selectedFood.defaultServing;
                  return <div style={{ background: C.bg, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}><span style={{ fontSize: 22, fontWeight: 700, color: C.primary, fontFamily: "'DM Serif Display', serif" }}>{Math.round(selectedFood.cal * m)} cal</span><span style={{ fontSize: 12, color: C.muted, marginLeft: 10 }}>P:{r(selectedFood.protein * m)}g · NC:{r(Math.max(0, (selectedFood.carbs - selectedFood.fiber) * m))}g · F:{r(selectedFood.fat * m)}g · Fib:{r(selectedFood.fiber * m)}g</span></div>;
                })()}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => { setSelectedFood(null); setServingAmount(""); setSearch(""); }} style={{ flex: 1, padding: 13, borderRadius: 10, border: `1.5px solid ${C.border}`, background: "white", fontSize: 14, fontWeight: 600, color: C.muted, cursor: "pointer" }}>Cancel</button>
                  <button onClick={addFood} style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Add to {selectedMeal}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* EXERCISE */}
        {tab === "exercise" && (
          <div>
            <div style={{ background: "white", borderRadius: 18, padding: 20, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, marginBottom: 18 }}>Log Exercise</div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Activity</label>
              <select value={exerciseName} onChange={e => setExerciseName(e.target.value)} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, background: "white", marginBottom: 14 }}>
                <option value="">Select activity...</option>
                {exercises.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
                <option value="Other">Other (enter calories manually)</option>
              </select>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Duration (minutes)</label>
              <input type="number" value={exerciseDuration} onChange={e => setExerciseDuration(e.target.value)} placeholder="e.g. 30" style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 14 }} />
              {exerciseName === "Other" && <>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Calories Burned</label>
                <input type="number" value={customCal} onChange={e => setCustomCal(e.target.value)} placeholder="e.g. 200" style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 14 }} />
              </>}
              {exerciseName && exerciseDuration && exerciseName !== "Other" && (() => {
                const lib = exercises.find(e => e.name === exerciseName);
                const est = lib ? Math.round(lib.calPerMin * parseFloat(exerciseDuration)) : 0;
                return <div style={{ background: "#FFF5EF", borderRadius: 10, padding: "11px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: C.muted }}>Estimated burn</span><span style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>−{est} cal</span></div>;
              })()}
              <button onClick={addExercise} style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: C.accent, color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Log Exercise</button>
            </div>
          </div>
        )}

        {/* MEALS */}
        {tab === "meals" && (
          <div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, marginBottom: 4 }}>Meal Plans & Recipes</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Galveston-aligned · tap to log all items at once</div>
            <div style={{ display: "flex", gap: 7, marginBottom: 18, overflowX: "auto", paddingBottom: 4 }}>
              {["All", "Breakfast", "Lunch", "Dinner", "Snacks"].map(f => (
                <button key={f} onClick={() => setMealFilter(f)} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: mealFilter === f ? C.primary : "white", color: mealFilter === f ? "white" : C.text, border: `1.5px solid ${mealFilter === f ? C.primary : C.border}`, cursor: "pointer" }}>{f}</button>
              ))}
            </div>
            {filteredRecipes.map(recipe => {
              const t = recipe.items.reduce((acc, item) => {
                const food = foods.find(f => f.id === item.foodId);
                if (!food) return acc;
                const m = item.servingAmount / food.defaultServing;
                return { cal: acc.cal + food.cal * m, protein: acc.protein + food.protein * m, carbs: acc.carbs + food.carbs * m, fat: acc.fat + food.fat * m, fiber: acc.fiber + (food.fiber || 0) * m };
              }, { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
              const nc = netCarbsOf(t.carbs, t.fiber);
              return (
                <div key={recipe.id} style={{ background: "white", borderRadius: 18, padding: 18, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, flex: 1 }}>{recipe.name}</div>
                    <span style={{ background: C.bg, color: C.primary, fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 10, marginLeft: 8, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{recipe.badge}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>{recipe.description}</div>
                  <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" as const }}>
                    {[{ label: "cal", val: Math.round(t.cal), bg: "#EEF4F0", color: C.primary }, { label: "P", val: r(t.protein) + "g", bg: "#FFF1EC", color: C.protein }, { label: "NC", val: r(nc) + "g", bg: "#FFF8EC", color: C.gold }, { label: "Fat", val: r(t.fat) + "g", bg: "#F0FAF4", color: C.fat }, { label: "Fib", val: r(t.fiber) + "g", bg: "#F5F2FD", color: C.fiber }].map(p => (
                      <div key={p.label} style={{ background: p.bg, color: p.color, fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 8 }}>{p.val} <span style={{ fontWeight: 400, opacity: 0.75, fontSize: 10 }}>{p.label}</span></div>
                    ))}
                  </div>
                  {recipe.items.map(item => {
                    const food = foods.find(f => f.id === item.foodId);
                    if (!food) return null;
                    return <div key={item.foodId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.muted, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}><span>{food.name}</span><span style={{ color: C.text, fontWeight: 500 }}>{item.servingAmount} {food.unit}</span></div>;
                  })}
                  <button onClick={() => logRecipe(recipe)} style={{ width: "100%", marginTop: 14, padding: 12, borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>+ Log to {recipe.mealType}</button>
                </div>
              );
            })}
          </div>
        )}

        {/* HISTORY */}
        {tab === "history" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10, paddingLeft: 4 }}>Select Day</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
                {(historyDates.length ? historyDates : [date]).map(d => {
                  const sel = d === historyDate;
                  const isT = d === date;
                  const dObj = new Date(d + "T12:00");
                  return (
                    <button key={d} onClick={() => setHistoryDate(d)} style={{ flexShrink: 0, minWidth: 78, padding: "10px 8px", borderRadius: 12, border: `1.5px solid ${sel ? C.primary : C.border}`, background: sel ? C.primary : "white", color: sel ? "white" : C.text, cursor: "pointer", textAlign: "center" }}>
                      <div style={{ fontSize: 10.5, opacity: 0.75, fontWeight: 600 }}>{isT ? "Today" : dObj.toLocaleDateString("en", { weekday: "short" })}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, margin: "3px 0" }}>{dObj.toLocaleDateString("en", { month: "short", day: "numeric" })}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ background: "white", borderRadius: 18, padding: 20, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, marginBottom: 16 }}>Macro Analysis</div>
              {(() => {
                const { protein: hP, carbs: hC, fat: hF, fiber: hFib, netCarbs: hNC, netCal: hNet } = dayTotals(historyFood, historyEx);
                return <>
                  <BarAnalysis label="Calories (net)" actual={hNet} target={DAILY_CAL} color={C.primary} unit=" cal" />
                  <BarAnalysis label="Protein" actual={hP} target={PROTEIN_TARGET} color={C.protein} />
                  <BarAnalysis label={carbsLabel} actual={carbs_mode === "net" ? hNC : hC} target={CARBS_TARGET} color={C.gold} />
                  <BarAnalysis label="Fat" actual={hF} target={FAT_TARGET} color={C.fat} />
                  <BarAnalysis label="Fibre" actual={hFib} target={FIBER_TARGET} color={C.fiber} />
                </>;
              })()}
            </div>
          </div>
        )}

        {/* LIBRARY */}
        {tab === "library" && (
          <div>
            <input type="text" placeholder="🔍  Search library..." value={libSearch} onChange={e => setLibSearch(e.target.value)} style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, background: "white", marginBottom: 14, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }} />
            {!newFood && <button onClick={() => setNewFood(EMPTY_FOOD)} style={{ width: "100%", padding: 11, borderRadius: 12, border: `1.5px dashed ${C.primary}`, background: "none", color: C.primary, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>+ Add my own food</button>}
            {newFood && (
              <div style={{ background: "white", borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, marginBottom: 10 }}>Add my own food</div>
                <input aria-label="Food name" placeholder="Name" value={newFood.name} onChange={e => setNewFood({ ...newFood, name: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${C.border}`, fontSize: 14, background: C.bg, marginBottom: 8 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  {([["defaultServing", "Serving size"], ["unit", "Unit (g, ml, piece…)"], ["cal", "Calories"], ["protein", "Protein (g)"], ["carbs", "Total carbs (g)"], ["fiber", "Fibre (g)"], ["fat", "Fat (g)"]] as const).map(([key, label]) => (
                    <input key={key} aria-label={label} placeholder={label} type={key === "unit" ? "text" : "number"} min="0" value={newFood[key]} onChange={e => setNewFood({ ...newFood, [key]: e.target.value })} style={{ padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${C.border}`, fontSize: 13.5, background: C.bg, minWidth: 0 }} />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Numbers are for one serving of the size you entered. Only you can see foods you add.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveCustomFood} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Save food</button>
                  <button onClick={() => setNewFood(null)} style={{ padding: "11px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "white", fontSize: 13.5, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            )}
            {filteredLib.map(f => (
              <div key={f.id} style={{ background: "white", borderRadius: 14, padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{f.name}</div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{f.category} · per {f.defaultServing} {f.unit}{f.custom && <> · <button onClick={() => deleteCustomFood(f.id)} style={{ background: "none", border: "none", color: "#D64545", fontSize: 11.5, cursor: "pointer", padding: 0 }}>delete</button></>}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: C.primary, fontFamily: "'DM Serif Display', serif" }}>{f.cal}</div>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[{ label: "Protein", val: f.protein, color: C.protein, bg: "#FFF1EC" }, { label: "Net C", val: netCarbsOf(f.carbs, f.fiber), color: C.gold, bg: "#FFF8EC" }, { label: "Fat", val: f.fat, color: C.fat, bg: "#F0FAF4" }, { label: "Fibre", val: f.fiber, color: C.fiber, bg: "#F5F2FD" }].map(m => (
                    <div key={m.label} style={{ flex: 1, textAlign: "center", background: m.bg, borderRadius: 8, padding: "6px 0" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{m.val}g</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setTab("food"); setSearch(f.name); setSelectedFood(f); setServingAmount(String(f.defaultServing)); }} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1.5px solid ${C.primary}`, background: "white", color: C.primary, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>+ Add to Log</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
