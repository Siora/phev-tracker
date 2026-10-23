/*
 * PHEV Tracker – Diagramme ohne externe Bibliotheken
 *
 * Rendert Zeitverläufe, Kostenverteilung, Preisentwicklung und Anbieterwerte.
 * Die Diagramme arbeiten ausschließlich mit den gefilterten Einträgen.
 */
const AnalyticsCharts = (() => {
  const money = (value, currency) => new Intl.NumberFormat('de-CH', {maximumFractionDigits: 2}).format(value) + ' ' + currency;
  const num = (value, digits = 1) => new Intl.NumberFormat('de-CH', {maximumFractionDigits: digits}).format(value);
  const clean = (node) => node.replaceChildren();
  const quantity = (value) => { const n = Number(String(value ?? 0).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const empty = (node, message = 'Für diese Auswahl sind keine Daten vorhanden.') => {
    const p = document.createElement('p');
    p.className = 'chart-empty';
    p.textContent = message;
    node.append(p);
  };
  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const tooltip = (node, text) => {
    node.title = text;
    node.setAttribute('aria-label', text);
    node.tabIndex = 0;
  };
  // Gruppiert Messwerte monatsweise und erzeugt ein interaktives Balkendiagramm.
  function trend(node, entries, metric, currency, convert) {
    clean(node);
    const groups = new Map();
    entries.forEach(entry => {
      const month = entry.date.slice(0, 7);
      if (!groups.has(month)) groups.set(month, {energy: 0, cost: 0, fuel: 0});
      const value = groups.get(month);
      if (entry.type === 'charge') value.energy += quantity(entry.amount);
      if (entry.type === 'fuel') value.fuel += quantity(entry.amount);
      value.cost += convert(entry);
    });
    const months = [...groups.keys()].sort();
    if (!months.length) return empty(node);
    const max = Math.max(1, ...months.map(month => groups.get(month)[metric]));
    const unit = metric === 'cost' ? currency : metric === 'fuel' ? 'l' : 'kWh';
    const bars = element('div', 'trend-bars');
    months.forEach(month => {
      const value = groups.get(month)[metric];
      const item = element('div', 'trend-item');
      const amount = element('span', 'trend-amount', num(value));
      const track = element('div', 'trend-track');
      const bar = element('div', 'trend-bar');
      bar.style.height = (value > 0 ? Math.max(3, value / max * 100) : 0) + '%';
      tooltip(bar, month + ': ' + num(value, 2) + ' ' + unit);
      track.append(bar);
      item.append(amount, track, element('span', 'trend-label', month.slice(2)));
      bars.append(item);
    });
    node.append(bars, element('p', 'chart-hint', 'Balken berühren, um Monatswerte anzuzeigen.'));
  }
  // Vergleicht Strom- und Kraftstoffkosten in der gewählten Währung.
  function donut(node, entries, currency, convert) {
    clean(node);
    const charge = entries.filter(e => e.type === 'charge').reduce((s, e) => s + convert(e), 0);
    const fuel = entries.filter(e => e.type === 'fuel').reduce((s, e) => s + convert(e), 0);
    const total = charge + fuel;
    if (!total) return empty(node);
    const ratio = charge / total * 100;
    const layout = element('div', 'donut-layout');
    const ring = element('div', 'donut-ring');
    ring.style.background = 'conic-gradient(#38c86a 0% ' + ratio + '%, #3b95ff ' + ratio + '% 100%)';
    const center = element('div', 'donut-center');
    center.append(element('small', '', 'Gesamt'), element('strong', '', money(total, currency)));
    ring.append(center);
    tooltip(ring, 'Strom: ' + money(charge, currency) + ', Benzin: ' + money(fuel, currency));
    const legend = element('div', 'donut-legend');
    [['Strom', charge, 'electric'], ['Benzin', fuel, 'petrol']].forEach(([label, value, cls]) => {
      const line = element('div', 'legend-row');
      const name = element('span', 'legend-name ' + cls, label);
      const val = element('strong', '', money(value, currency));
      line.append(name, val);
      legend.append(line);
    });
    layout.append(ring, legend);
    node.append(layout);
  }
  // Gewichteter durchschnittlicher Strompreis je Monat.
  function price(node, entries, currency, convert) {
    clean(node);
    const groups = new Map();
    entries.filter(e => e.type === 'charge' && quantity(e.amount) > 0).forEach(e => {
      const month = e.date.slice(0, 7);
      if (!groups.has(month)) groups.set(month, {energy: 0, cost: 0});
      const v = groups.get(month);
      v.energy += quantity(e.amount);
      v.cost += convert(e);
    });
    const months = [...groups.keys()].sort();
    if (!months.length) return empty(node, 'Noch keine Ladungen für diese Auswahl.');
    const values = months.map(m => groups.get(m).cost / groups.get(m).energy);
    const width = 600, height = 180, pad = 24;
    const low = Math.min(...values), high = Math.max(...values);
    const margin = Math.max(0.015, (high - low) * 0.2);
    const min = Math.max(0, low - margin), max = high + margin;
    const point = (v, i) => ({
      x: months.length === 1 ? width / 2 : pad + i * (width - pad * 2) / (months.length - 1),
      y: height - pad - (v - min) / (max - min) * (height - pad * 2)
    });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 600 180');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Monatlicher durchschnittlicher Strompreis');
    const polyline = document.createElementNS(svg.namespaceURI, 'polyline');
    polyline.setAttribute('points', values.map((v, i) => {const p = point(v, i); return p.x + ',' + p.y;}).join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#8ab7ff');
    polyline.setAttribute('stroke-width', '4');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    svg.append(polyline);
    values.forEach((value, i) => {
      const p = point(value, i);
      const circle = document.createElementNS(svg.namespaceURI, 'circle');
      circle.setAttribute('cx', p.x);
      circle.setAttribute('cy', p.y);
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', '#b8d5ff');
      const title = document.createElementNS(svg.namespaceURI, 'title');
      title.textContent = months[i] + ': ' + money(value, currency) + '/kWh';
      circle.append(title);
      svg.append(circle);
    });
    const labels = element('div', 'line-labels');
    months.forEach((month, i) => {
      const label = element('span', '', month.slice(2));
      tooltip(label, month + ': ' + money(values[i], currency) + '/kWh');
      labels.append(label);
    });
    node.append(svg, labels);
  }
  function providers(node, entries) {
    clean(node);
    const groups = new Map();
    entries.filter(e => e.type === 'charge').forEach(e => {
      const provider = (e.place || 'Unbekannt').trim() || 'Unbekannt';
      groups.set(provider, (groups.get(provider) || 0) + quantity(e.amount));
    });
    const rows = [...groups].sort((a, b) => b[1] - a[1]);
    if (!rows.length) return empty(node, 'Keine Ladevorgänge für diese Auswahl.');
    const max = Math.max(1, ...rows.map(row => row[1]));
    rows.forEach(([name, value]) => {
      const row = element('div', 'provider-row');
      const label = element('span', 'provider-label', name);
      const track = element('div', 'provider-track');
      const bar = element('div', 'provider-fill');
      bar.style.width = value / max * 100 + '%';
      tooltip(bar, name + ': ' + num(value, 2) + ' kWh');
      track.append(bar);
      row.append(label, track, element('strong', 'provider-value', num(value, 1) + ' kWh'));
      node.append(row);
    });
  }
  return {trend, donut, price, providers};
})();
