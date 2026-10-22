/**
 * PHEV Tracker – Fahrzeugkosten-Berechnung (v88)
 *
 * Dieses Modul ist absichtlich zustandslos: keine DOM-Zugriffe, kein localStorage,
 * keine Cloud-Anfragen und keine Änderung der übergebenen Datensätze.
 *
 * Die Darstellung, Fahrzeugauswahl und das bestätigte Speichern bleiben in app.js.
 * Dadurch hängt der Dashboard-Start nicht von einer neuen Initialisierungsroutine ab.
 */
window.PhevTco = Object.freeze({
  /**
   * Fällige und bevorstehende Wartungen aus vorhandenen Fahrzeugausgaben.
   * Pro Kategorie/Fahrzeug zählt nur der jüngste Eintrag mit Folgetermin.
   * So werden historische Services nicht mehrfach als Erinnerung angezeigt.
   * Keine zusätzlichen Kosten: die bestehenden Ausgaben bleiben die Quelle.
   */
  reminders(expenses,vehicleId,today=new Date(),horizonDays=30){
    const day=new Date(today.getFullYear(),today.getMonth(),today.getDate());
    const latest=new Map();
    for(const expense of expenses){
      if(vehicleId&&String(expense.vehicle_id)!==String(vehicleId))continue;
      if(!expense.next_service_date||!/^\d{4}-\d{2}-\d{2}$/.test(expense.next_service_date))continue;
      const key=String(expense.vehicle_id)+'|'+String(expense.category);
      const existing=latest.get(key);
      if(!existing||String(expense.date)>String(existing.date))latest.set(key,expense);
    }
    return [...latest.values()].map(expense=>{
      const [year,month,date]=expense.next_service_date.split('-').map(Number);
      const due=new Date(year,month-1,date);
      if(due.getFullYear()!==year||due.getMonth()!==month-1||due.getDate()!==date)return null;
      const days=Math.round((due-day)/86400000);
      return {...expense,days,overdue:days<0};
    }).filter(x=>x&&x.days<=horizonDays).sort((a,b)=>a.days-b.days);
  },
  /**
   * Rechnet einen Ausgabenbetrag in die eingestellte Basiswährung um.
   * Der Wechselkurs wird exakt wie in der bisherigen App verwendet.
   * @param {number} amount Originalbetrag.
   * @param {string} currency Ursprungswährung (CHF oder EUR).
   * @param {{base:string,rate:number}} settings Währungseinstellungen.
   * @returns {number} Betrag in Basiswährung.
   */
  convert(amount, currency, settings) {
    return currency === settings.base
      ? amount
      : settings.base === 'CHF' ? amount * settings.rate : amount / settings.rate;
  },

  /**
   * Summiert Zusatzkosten und Fahrtkosten eines Fahrzeugs.
   * Ohne Fahrzeugfilter werden alle Datensätze berücksichtigt.
   * Die Kilometerstandsspanne ist eine Näherung und keine Fahrtenmessung.
   * @param {Array} expenses Zusätzliche Fahrzeugausgaben.
   * @param {Array} records Lade- und Tankdatensätze.
   * @param {string} vehicleId Fahrzeug-ID oder leer für alle Fahrzeuge.
   * @param {{base:string,rate:number}} settings Währungseinstellungen.
   * @param {(record:object)=>number} convertRecord Vorhandene App-Kostenumrechnung.
   */
  /**
   * Liefert eine transparente Kostenverteilung je Kategorie.
   *
   * Nur Kosten des ausgewählten Fahrzeugs werden berücksichtigt. Strom und
   * Kraftstoff stammen aus den bestehenden Lade-/Tankvorgängen; sonstige
   * Kategorien aus den zusätzlichen Fahrzeugausgaben. Es werden keine
   * Schätzwerte ergänzt und keine Datensätze verändert.
   *
   * @returns {Array<{category:string,amount:number}>} Kategorien mit Betrag
   *   in der gewählten Basiswährung, absteigend nach Kosten sortiert.
   */
  breakdown(expenses, records, vehicleId, settings, convertRecord) {
    const totals = new Map();
    const add = (category, amount) => {
      if (!Number.isFinite(amount)) return;
      totals.set(category, (totals.get(category) || 0) + amount);
    };
    for (const expense of expenses) {
      if (vehicleId && String(expense.vehicle_id) !== String(vehicleId)) continue;
      const amount = Number(expense.amount);
      if (Number.isFinite(amount) && amount > 0) {
        add(expense.category || 'Sonstiges', this.convert(amount, expense.currency, settings));
      }
    }
    for (const record of records) {
      if (vehicleId && String(record.vehicle_id) !== String(vehicleId)) continue;
      if (record.type !== 'charge' && record.type !== 'fuel') continue;
      add(record.type === 'charge' ? 'Strom' : 'Benzin', convertRecord(record));
    }
    return [...totals].map(([category, amount]) => ({category, amount}))
      .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
  },

  summarize(expenses, records, vehicleId, settings, convertRecord) {
    const selectedExpenses = expenses
      .filter(item => !vehicleId || String(item.vehicle_id) === String(vehicleId))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
    const extra = selectedExpenses.reduce(
      (sum, item) => sum + this.convert(Number(item.amount), item.currency, settings), 0
    );
    const matchingRecords = records.filter(
      item => !vehicleId || String(item.vehicle_id) === String(vehicleId)
    );
    const running = matchingRecords.reduce((sum, item) => sum + convertRecord(item), 0);
    const mileages = matchingRecords.map(item => Number(item.km))
      .filter(value => Number.isFinite(value) && value > 0);
    const distance = mileages.length > 1
      ? Math.max(...mileages) - Math.min(...mileages) : 0;
    return {expenses: selectedExpenses, extra, running, distance, total: extra + running};
  }
});
