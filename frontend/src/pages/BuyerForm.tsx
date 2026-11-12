import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchBuyer,
  fetchCriteriaOptions,
  saveBuyer,
  type BuyerCriteria,
  type BuyerInput,
  type CriteriaOptions,
} from "../api";

const EMPTY: BuyerInput = {
  name: "",
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  notes: null,
  active: true,
  criteria: {
    categories: [],
    areas: [],
    excluded_areas: [],
    min_price_man: null,
    max_price_man: null,
    min_yield_pct: null,
    max_age_years: null,
    structures: [],
    min_land_tsubo: null,
    max_land_tsubo: null,
    max_walk_minutes: null,
    ng_keywords: [],
  },
};

type NumberKey = {
  [K in keyof BuyerCriteria]: BuyerCriteria[K] extends number | null ? K : never;
}[keyof BuyerCriteria];
type ListKey = "areas" | "excluded_areas" | "ng_keywords";

/** 「港区、渋谷区 東京23区」のような入力をリストに分割する。 */
function splitList(value: string): string[] {
  return value
    .split(/[,、，\s　]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function BuyerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<BuyerInput>(EMPTY);
  const [listText, setListText] = useState<Record<ListKey, string>>({ areas: "", excluded_areas: "", ng_keywords: "" });
  const [options, setOptions] = useState<CriteriaOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCriteriaOptions()
      .then(setOptions)
      .catch((err) => setError(err.message));
    if (!id) return;
    fetchBuyer(id)
      .then((buyer) => {
        setForm(buyer);
        setListText({
          areas: buyer.criteria.areas.join("、"),
          excluded_areas: buyer.criteria.excluded_areas.join("、"),
          ng_keywords: buyer.criteria.ng_keywords.join("、"),
        });
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const setField = <K extends keyof BuyerInput>(key: K, value: BuyerInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setCriteria = <K extends keyof BuyerCriteria>(key: K, value: BuyerCriteria[K]) =>
    setForm((f) => ({ ...f, criteria: { ...f.criteria, [key]: value } }));

  const toggle = (key: "categories" | "structures", value: string) => {
    const current = form.criteria[key];
    setCriteria(key, current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };

  const addAreaPreset = (preset: string) => {
    const areas = splitList(listText.areas);
    if (!areas.includes(preset)) setListText((t) => ({ ...t, areas: [...areas, preset].join("、") }));
  };

  const numberInput = (key: NumberKey, placeholder: string, step = "any") => (
    <input
      type="number"
      step={step}
      min="0"
      placeholder={placeholder}
      value={form.criteria[key] ?? ""}
      onChange={(e) => setCriteria(key, e.target.value === "" ? null : Number(e.target.value))}
    />
  );

  const textField = (key: "contact_name" | "contact_email" | "contact_phone", type = "text") => (
    <input
      type={type}
      value={form[key] ?? ""}
      onChange={(e) => setField(key, e.target.value || null)}
    />
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: BuyerInput = {
      ...form,
      criteria: {
        ...form.criteria,
        areas: splitList(listText.areas),
        excluded_areas: splitList(listText.excluded_areas),
        ng_keywords: splitList(listText.ng_keywords),
      },
    };
    saveBuyer(payload, id)
      .then((saved) => navigate(`/buyers/${saved.id}`))
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  return (
    <div>
      <Link to={id ? `/buyers/${id}` : "/buyers"} className="back-link">
        ← 戻る
      </Link>
      <h1>{id ? "会社クライテリアの編集" : "会社の追加"}</h1>

      <form className="buyer-form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>会社情報</legend>
          <label>
            <span>
              会社名 <span className="required">必須</span>
            </span>
            <input required value={form.name} onChange={(e) => setField("name", e.target.value)} />
          </label>
          <div className="form-row">
            <label>
              担当者
              {textField("contact_name")}
            </label>
            <label>
              メール
              {textField("contact_email", "email")}
            </label>
            <label>
              電話
              {textField("contact_phone", "tel")}
            </label>
          </div>
          <label>
            メモ(社内向け)
            <textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value || null)}
            />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={form.active} onChange={(e) => setField("active", e.target.checked)} />
            紹介対象にする(外すとマッチング対象から除外)
          </label>
        </fieldset>

        <fieldset>
          <legend>購入クライテリア</legend>
          <p className="muted small">未入力の条件は判定に使いません(条件なし扱い)。</p>

          <div className="field">
            <span className="field-label">物件種別</span>
            <div className="chip-group">
              {options?.categories.map((c) => (
                <label key={c} className={`chip ${form.criteria.categories.includes(c) ? "chip-on" : ""}`}>
                  <input type="checkbox" checked={form.criteria.categories.includes(c)} onChange={() => toggle("categories", c)} />
                  {c}
                </label>
              ))}
            </div>
          </div>

          <label>
            対象エリア(読点・スペース区切り。所在地にいずれかが含まれれば適合)
            <input
              placeholder="例: 港区、渋谷区、横浜市、東京23区"
              value={listText.areas}
              onChange={(e) => setListText((t) => ({ ...t, areas: e.target.value }))}
            />
          </label>
          {options && (
            <div className="chip-group">
              <span className="muted small">まとめて追加:</span>
              {Object.keys(options.area_presets).map((preset) => (
                <button
                  type="button"
                  key={preset}
                  className="chip chip-button"
                  title={options.area_presets[preset].join("・")}
                  onClick={() => addAreaPreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}
          <label>
            除外エリア
            <input
              placeholder="例: 足立区、葛飾区"
              value={listText.excluded_areas}
              onChange={(e) => setListText((t) => ({ ...t, excluded_areas: e.target.value }))}
            />
          </label>

          <div className="form-row">
            <label>
              価格 下限(万円)
              {numberInput("min_price_man", "例: 10000")}
            </label>
            <label>
              価格 上限(万円)
              {numberInput("max_price_man", "例: 50000")}
            </label>
            <label>
              表面利回り 下限(%)
              {numberInput("min_yield_pct", "例: 6.5")}
            </label>
          </div>

          <div className="form-row">
            <label>
              築年数 上限(年)
              {numberInput("max_age_years", "例: 30", "1")}
            </label>
            <label>
              駅徒歩 上限(分)
              {numberInput("max_walk_minutes", "例: 10", "1")}
            </label>
          </div>

          <div className="field">
            <span className="field-label">構造</span>
            <div className="chip-group">
              {options?.structures.map((s) => (
                <label key={s} className={`chip ${form.criteria.structures.includes(s) ? "chip-on" : ""}`}>
                  <input type="checkbox" checked={form.criteria.structures.includes(s)} onChange={() => toggle("structures", s)} />
                  {s}
                </label>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label>
              土地面積 下限(坪)
              {numberInput("min_land_tsubo", "例: 30")}
            </label>
            <label>
              土地面積 上限(坪)
              {numberInput("max_land_tsubo", "例: 300")}
            </label>
          </div>

          <label>
            NGワード(本文に含まれていたら対象外)
            <input
              placeholder="例: 借地、再建築不可、旧耐震"
              value={listText.ng_keywords}
              onChange={(e) => setListText((t) => ({ ...t, ng_keywords: e.target.value }))}
            />
          </label>
          <p className="muted small">
            ※ 利回りは土地・戸建、築年数・構造は土地には適用しません。
          </p>
        </fieldset>

        {error && <p className="error">エラー: {error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
