import { ALGERIA_LOCATIONS } from "../data/algeria-locations.js";

export { ALGERIA_LOCATIONS };

/**
 * Attaches Wilaya -> Commune cascade behavior to a pair of select elements.
 *
 * Strict UX / Functional Rules:
 * - Commune select MUST remain disabled with placeholder "— اختر الولاية أولاً —"
 * - Customer cannot pick or see communes before choosing a Wilaya
 * - Choosing a Wilaya enables Commune and displays ONLY that Wilaya's communes
 * - Changing Wilaya resets Commune selection immediately
 * - Resetting Wilaya disables Commune again
 */
export function setupWilayaCommuneCascade({
  wilayaSelectId,
  communeSelectId,
  wilayaFieldId,
  communeFieldId
}) {
  const wSelect = document.getElementById(wilayaSelectId);
  const cSelect = document.getElementById(communeSelectId);
  if (!wSelect || !cSelect) return null;

  // 1. Populate Wilayas dropdown
  const currentW = wSelect.value;
  wSelect.innerHTML =
    '<option value="">— اختر الولاية —</option>' +
    ALGERIA_LOCATIONS.map(w => `<option value="${w.name}">${w.code} — ${w.name}</option>`).join("");
  if (currentW) wSelect.value = currentW;

  // 2. Synchronize communes based on current Wilaya
  function syncCommunes(resetSelection = false) {
    const selectedWilayaName = wSelect.value;

    if (!selectedWilayaName) {
      cSelect.innerHTML = '<option value="">— اختر الولاية أولاً —</option>';
      cSelect.value = "";
      cSelect.disabled = true;
      return;
    }

    const wilayaData = ALGERIA_LOCATIONS.find(w => w.name === selectedWilayaName);
    if (!wilayaData || !wilayaData.communes || wilayaData.communes.length === 0) {
      cSelect.innerHTML = '<option value="">— لا توجد بلديات متاحة —</option>';
      cSelect.value = "";
      cSelect.disabled = true;
      return;
    }

    const currentC = resetSelection ? "" : cSelect.value;
    cSelect.innerHTML =
      '<option value="">— اختر البلدية —</option>' +
      wilayaData.communes.map(c => {
        const label = c.name + (c.name_latin ? ` (${c.name_latin})` : "");
        return `<option value="${c.name}">${label}</option>`;
      }).join("");

    cSelect.disabled = false;
    if (currentC && wilayaData.communes.some(c => c.name === currentC)) {
      cSelect.value = currentC;
    } else {
      cSelect.value = "";
    }
  }

  // Initial sync
  syncCommunes(false);

  // 3. Wilaya change event
  wSelect.addEventListener("change", () => {
    syncCommunes(true);

    if (wilayaFieldId && wSelect.value) {
      document.getElementById(wilayaFieldId)?.classList.remove("invalid");
    }
    if (communeFieldId) {
      document.getElementById(communeFieldId)?.classList.remove("invalid");
    }
  });

  // 4. Commune change event
  cSelect.addEventListener("change", () => {
    if (communeFieldId && cSelect.value) {
      document.getElementById(communeFieldId)?.classList.remove("invalid");
    }
  });

  return { syncCommunes };
}
