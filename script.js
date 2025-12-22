const CSV_URL = "https://docs.google.com/spreadsheets/d/1fMTkW693q-Nq1JKTvQjQ7xZ-mTO93dg2n8WLqLXMU1k/edit?usp=sharing";

const table = document.getElementById("table");
const filter = document.getElementById("filter");

fetch(CSV_URL)
  .then(res => res.text())
  .then(text => {
    const rows = text.split("\n").map(r => r.split(","));
    render(rows);
    
    filter.onchange = () => render(rows);
  });

function render(rows) {
  table.innerHTML = "";
  const limit = parseFloat(filter.value);

  rows.forEach((row, i) => {
    if (i === 0) {
      table.innerHTML += `<tr>${row.map(c => `<th>${c}</th>`).join("")}</tr>`;
      return;
    }

    const deviation = Math.abs(parseFloat(row[4]));
    if (deviation <= limit) {
      table.innerHTML += `<tr>${row.map(c => `<td>${c}</td>`).join("")}</tr>`;
    }
  });
}
