// main.js

// ============================
// Função de dados simulados
// ============================
async function fetchSheetData(sheetName) {
  switch (sheetName) {
    case "TipoEspaco":
      return [
        { id: 1, nome: "Sala" },
        { id: 2, nome: "Auditório" },
        { id: 3, nome: "Estúdio" },
      ];
    case "Espaco":
      return [
        { id: 1, nome: "Sala 101", capacidade: 30, tipo: "Sala" },
        { id: 2, nome: "Auditório A", capacidade: 100, tipo: "Auditório" },
      ];
    case "Periodo":
      return [
        { id: 1, descricao: "Manhã" },
        { id: 2, descricao: "Tarde" },
        { id: 3, descricao: "Dia Inteiro" },
      ];
    case "PrecoAluguer":
      return [
        {
          espaco: "Sala 101",
          periodo: "Manhã",
          preco: 50,
          qr: "https://exemplo.com/qr1",
        },
        {
          espaco: "Auditório A",
          periodo: "Dia Inteiro",
          preco: 300,
          qr: "https://exemplo.com/qr2",
        },
      ];
    case "Equipamento":
      return [
        { id: 1, nome: "Projetor" },
        { id: 2, nome: "Microfone" },
      ];
    case "EspacoEquip":
      return [
        { espaco: "Sala 101", equipamento: "Projetor", quantidade: 1 },
        { espaco: "Auditório A", equipamento: "Microfone", quantidade: 4 },
      ];
    case "OutrosEspacos":
      return [{ id: 1, nome: "Sala de Reunião" }];
    default:
      return [];
  }
}

// ============================
// Função para buscar dados do CSV local usando PapaParse
// ============================
async function fetchSheetDataFromCSV() {
  return fetch("tabela_unificada_espacos.csv")
    .then((response) => response.text())
    .then((csv) => {
      return new Promise((resolve) => {
        if (window.Papa) {
          Papa.parse(csv, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
          });
        } else {
          // fallback simples
          const lines = csv.split("\n");
          const headers = lines[0].split(",");
          const data = lines.slice(1).map((l) => {
            const obj = {};
            l.split(",").forEach((v, i) => (obj[headers[i]] = v));
            return obj;
          });
          resolve(data);
        }
      });
    });
}

// ============================
// Função para carregar e processar o novo CSV
// ============================
const CSV_PATH = "tabela_unificada_espacos_normalizado.csv";

function carregarEspacos(callback) {
  Papa.parse(CSV_PATH, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      // Conversão dos campos numéricos
      const data = results.data.map((item) => ({
        ...item,
        capacidade: parseInt(item.capacidade, 10),
        preco_meio_dia: item.preco_meio_dia
          ? parseFloat(item.preco_meio_dia)
          : null,
        preco_todo_dia: item.preco_todo_dia
          ? parseFloat(item.preco_todo_dia)
          : null,
        equipamentos: item.equipamentos
          ? item.equipamentos.split(",").map((e) => e.trim())
          : [],
        outros_espacos: item.outros_espacos
          ? item.outros_espacos.split(",").map((e) => e.trim())
          : [],
      }));
      callback(data);
    },
  });
}

// ============================
// Alternância entre dados locais e Google Sheets
// ============================
const USAR_GOOGLE_SHEETS = false;
const GOOGLE_SHEETS_BASE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2fCcZ6ISWdh44AkDlFQKN9SFH8VRu0y8uBZaRXRnai2Whvp3HT7eYK7VMsYTUZwljZJ19JefWPLef/pub?output=csv";

// Função utilitária para carregar CSV local ou do Google Sheets
function carregarCSV(path) {
  if (!USAR_GOOGLE_SHEETS) {
    return new Promise((resolve) => {
      Papa.parse(path, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
          resolve(results.data);
        },
      });
    });
  } else {
    // Busca o CSV correto pelo parâmetro gid (um arquivo por aba) OU pelo parâmetro &sheet=Nome
    // Aqui, cada arquivo local tem um link próprio, basta trocar o nome do arquivo no final da URL
    // Exemplo: .../pub?output=csv&sheet=Espacos
    // Então, para cada arquivo, montamos a URL correta:
    let url = GOOGLE_SHEETS_BASE;
    // Troca o nome do arquivo local pelo parâmetro correto na URL
    if (path.endsWith('.csv')) {
      const nome = path.replace('.csv', '');
      url += `&sheet=${encodeURIComponent(nome)}`;
    }
    return fetch(url)
      .then((response) => response.text())
      .then(
        (csv) =>
          new Promise((resolve) => {
            Papa.parse(csv, {
              header: true,
              skipEmptyLines: true,
              complete: (results) => resolve(results.data),
            });
          })
      );
  }
}

// ============================
// Carregamento de múltiplos CSVs normalizados (ajustado para nomes dos arquivos gerados pelo seu script Python)
// ============================
const CSV_ESPACOS = "Espacos.csv";
const CSV_EQUIPAMENTOS = "Equipamentos.csv";
const CSV_ESPACO_EQUIPAMENTOS = "EspacoEquipamentos.csv";
const CSV_PRECOS = "Precos.csv";

// Carrega todas as tabelas e faz o join em memória
async function carregarDadosNormalizados() {
  const [espacos, equipamentos, espacoEquipamentos, precos] = await Promise.all(
    [
      carregarCSV(CSV_ESPACOS),
      carregarCSV(CSV_EQUIPAMENTOS),
      carregarCSV(CSV_ESPACO_EQUIPAMENTOS),
      carregarCSV(CSV_PRECOS),
    ]
  );

  // Indexação para join rápido
  const equipamentosById = Object.fromEntries(
    equipamentos.map((eq) => [eq.ID, eq.Nome])
  );
  const precosByEspacoPeriodo = {};
  precos.forEach((p) => {
    if (!precosByEspacoPeriodo[p.Espaco_ID])
      precosByEspacoPeriodo[p.Espaco_ID] = {};
    precosByEspacoPeriodo[p.Espaco_ID][p.Periodo] = p["Preco(AOA)"];
  });

  // Monta lista de espaços com detalhes
  const lista = espacos.map((e) => {
    // Busca equipamentos desse espaço
    const eqs = espacoEquipamentos
      .filter((ee) => ee.Espaco_ID === e.ID)
      .map((ee) => equipamentosById[ee.Equipamento_ID]);
    return {
      ...e,
      capacidade: e["Capacidade"],
      tipo_espaco: e["Tipo de Espaço"],
      espaco: e["Nome"],
      equipamentos: eqs,
      preco_meio_dia:
        precosByEspacoPeriodo[e.ID] && precosByEspacoPeriodo[e.ID]["Meio dia"]
          ? precosByEspacoPeriodo[e.ID]["Meio dia"]
          : "",
      preco_todo_dia:
        precosByEspacoPeriodo[e.ID] && precosByEspacoPeriodo[e.ID]["Todo dia"]
          ? precosByEspacoPeriodo[e.ID]["Todo dia"]
          : "",
    };
  });
  return lista;
}

// ============================
// Funções de renderização
// ============================

async function renderList(containerId, data, templateFn) {
  const container = document.getElementById(containerId);
  container.innerHTML = data.map(templateFn).join("");
}

async function renderTipoEspaco() {
  const data = await fetchSheetData("TipoEspaco");
  renderList("tipo-espaco", data, (e) => `<div class="mb-2">${e.nome}</div>`);
}

async function renderEspacos() {
  const data = await fetchSheetData("Espaco");
  renderList(
    "espacos",
    data,
    (e) =>
      `<div class="mb-2">${e.nome} (Capacidade: ${e.capacidade}, Tipo: ${e.tipo})</div>`
  );
}

async function renderPeriodos() {
  const data = await fetchSheetData("Periodo");
  renderList("periodos", data, (e) => `<div class="mb-2">${e.descricao}</div>`);
}

async function renderEquipamentos() {
  const data = await fetchSheetData("Equipamento");
  renderList("equipamentos", data, (e) => `<div class="mb-2">${e.nome}</div>`);
}

async function renderEspacoEquip() {
  const data = await fetchSheetData("EspacoEquip");
  renderList(
    "espaco-equip",
    data,
    (e) =>
      `<div class="mb-2">${e.espaco} - ${e.equipamento}: ${e.quantidade}</div>`
  );
}

async function renderOutrosEspacos() {
  const data = await fetchSheetData("OutrosEspacos");
  renderList(
    "outros-espacos",
    data,
    (e) => `<div class="mb-2">${e.nome}</div>`
  );
}

// Renderiza os cards de períodos disponíveis e espaços na página
async function renderPeriodosDisponiveis() {
  const periodosDiv = document.getElementById("periodos");
  const periodos = await carregarCSV("PeriodosDisponiveis.csv");
  // Agrupa períodos por nome do espaço
  const periodosPorEspaco = {};
  periodos.forEach((p) => {
    if (!periodosPorEspaco[p.Nome]) periodosPorEspaco[p.Nome] = [];
    periodosPorEspaco[p.Nome].push(p);
  });
  periodosDiv.innerHTML = Object.entries(periodosPorEspaco)
    .map(
      ([espaco, periodos]) => `
    <div class="mb-4 p-3 rounded-lg bg-gray-50 border border-destaque/10 shadow cursor-pointer periodo-card" data-espaco="${espaco}">
      <div class="font-bold text-destaque">${espaco}</div>
      <div class="text-sm text-gray-700">${periodos
        .map((p) => p["Tipo de Espaço"])
        .join(", ")}</div>
    </div>
  `
    )
    .join("");
  // Adiciona evento para abrir modal ao clicar no card
  const espacos = await carregarDadosNormalizados();
  document.querySelectorAll(".periodo-card").forEach((card) => {
    card.addEventListener("click", () => {
      const espacoNome = card.getAttribute("data-espaco");
      const item = espacos.find((e) => e.espaco === espacoNome);
      if (item) openModal(item);
    });
  });
}

async function renderEspacosCards() {
  const espacosDiv = document.getElementById("espacos");
  const espacos = await carregarCSV("Espacos.csv");
  const espacosDetalhados = await carregarDadosNormalizados();
  espacosDiv.innerHTML = espacos
    .map(
      (e) => `
    <div class="mb-4 p-3 rounded-lg bg-gray-50 border border-destaque/10 shadow cursor-pointer espaco-card" data-espaco="${e.Nome}">
      <div class="font-bold text-destaque">${e.Nome}</div>
      <div class="text-sm text-gray-700">Tipo: ${e["Tipo de Espaço"]} | Capacidade: ${e.Capacidade}</div>
    </div>
  `
    )
    .join("");
  // Adiciona evento para abrir modal ao clicar no card
  document.querySelectorAll(".espaco-card").forEach((card) => {
    card.addEventListener("click", () => {
      const espacoNome = card.getAttribute("data-espaco");
      const item = espacosDetalhados.find((e) => e.espaco === espacoNome);
      if (item) openModal(item);
    });
  });
}

// ============================
// Busca dinâmica, detalhes em modal e solicitação via WhatsApp
// ============================

// Estado global para busca
let searchTerm = "";

// Função para filtrar dados por termo de busca
function filterData(data) {
  if (!searchTerm) return data;
  const term = searchTerm.toLowerCase();
  return data.filter((row) =>
    Object.values(row).some((val) =>
      (val || "").toString().toLowerCase().includes(term)
    )
  );
}

// Função para abrir modal de detalhes
function openModal(data) {
  ensureModalHtml();
  const modal = document.getElementById("preco-modal");
  const modalContent = document.getElementById("preco-modal-content");
  const equipamentos = data.equipamentos || [];
  let selectedEquipamentos = [];
  let periodoSelecionado = "Meio dia";
  let precoSelecionado = data.preco_meio_dia;
  function atualizarPrecoModal() {
    let preco = precoSelecionado ? parseFloat(precoSelecionado) : 0;
    let acrescimo = preco * 0.1 * selectedEquipamentos.length;
    let precoFinal = preco + acrescimo;
    document.getElementById("preco-atual").textContent = precoFinal
      ? precoFinal.toLocaleString("pt-PT", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }) + " AOA"
      : "-";
  }
  modalContent.innerHTML = `
    <div class="p-6 animate-fade-in">
      <h2 class="text-2xl font-bold text-destaque mb-4 text-center">${
        data.espaco || ""
      }</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        <div><span class="font-semibold">Tipo:</span> ${
          data.tipo_espaco || ""
        }</div>
        <div><span class="font-semibold">Capacidade:</span> ${
          data.capacidade || ""
        }</div>
        <div class="sm:col-span-2 flex flex-col gap-2">
          <span class="font-semibold">Período:</span>
          <select id="periodo-select" class="w-full px-3 py-2 border border-destaque/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-destaque bg-white shadow-sm mt-1">
            <option value="meio_dia">Meio dia</option>
            <option value="todo_dia">Todo dia</option>
          </select>
        </div>
        <div class="sm:col-span-2"><span class="font-semibold">Preço:</span> <span id="preco-atual" class="text-destaque font-bold">${
          data.preco_meio_dia
            ? parseFloat(data.preco_meio_dia).toLocaleString("pt-PT", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              }) + " AOA"
            : "-"
        }</span></div>
      </div>
      <div class="mb-4"><span class="font-semibold">Equipamentos de Apoio:</span>
        <div id="equipamentos-list" class="flex flex-wrap gap-2 mt-2">
          ${
            equipamentos.length
              ? equipamentos
                  .map(
                    (eq, i) => `
            <label class="inline-flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-lg cursor-pointer border border-destaque/20 shadow-sm transition hover:bg-destaque/10">
              <input type="checkbox" class="form-checkbox accent-destaque" value="${eq}" data-eq-idx="${i}">
              <span>${eq}</span>
            </label>
          `
                  )
                  .join("")
              : '<span class="text-gray-400">Nenhum equipamento disponível</span>'
          }
        </div>
      </div>
      <button id="solicitar-btn" class="w-full py-3 rounded-lg bg-gradient-to-r from-[#85774b] to-[#b8a97a] text-white font-semibold hover:from-[#b8a97a] hover:to-[#85774b] transition text-lg mt-2 shadow-lg">Solicitar via WhatsApp</button>
    </div>
  `;
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  const modalBox = modal.firstElementChild;
  modalBox.classList.toggle("max-w-md", window.innerWidth >= 640);
  modalBox.classList.toggle("w-full", true);
  modalBox.classList.toggle("h-full", window.innerWidth < 640);
  modalBox.classList.toggle("rounded-2xl", window.innerWidth >= 640);
  modalBox.classList.toggle("rounded-none", window.innerWidth < 640);
  document.getElementById("periodo-select").addEventListener("change", (e) => {
    if (e.target.value === "todo_dia") {
      periodoSelecionado = "Todo dia";
      precoSelecionado = data.preco_todo_dia;
    } else {
      periodoSelecionado = "Meio dia";
      precoSelecionado = data.preco_meio_dia;
    }
    atualizarPrecoModal();
  });
  document
    .querySelectorAll('#equipamentos-list input[type="checkbox"]')
    .forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const val = e.target.value;
        if (e.target.checked) {
          if (!selectedEquipamentos.includes(val))
            selectedEquipamentos.push(val);
        } else {
          selectedEquipamentos = selectedEquipamentos.filter(
            (eq) => eq !== val
          );
        }
        atualizarPrecoModal();
      });
    });
  document.getElementById("solicitar-btn").addEventListener("click", () => {
    const numero = "244923259580";
    let mensagem = `Olá! Gostaria de solicitar o espaço: ${
      data.espaco || ""
    }%0A`;
    mensagem += `Tipo de Espaço: ${data.tipo_espaco || ""}%0A`;
    mensagem += `Capacidade: ${data.capacidade || ""}%0A`;
    mensagem += `Período: ${periodoSelecionado}%0A`;
    mensagem += `Preço de Aluguer: ${
      document.getElementById("preco-atual").textContent
    }%0A`;
    if (selectedEquipamentos.length) {
      mensagem += `Equipamentos de Apoio: ${selectedEquipamentos.join(
        ", "
      )}%0A`;
    }
    mensagem += "Solicitação feita via site.";
    const url = `https://wa.me/${numero}?text=${mensagem}`;
    window.open(url, "_blank");
  });
}

// Função para fechar modal
function closeModal() {
  const modal = document.getElementById("preco-modal");
  if (modal) {
    modal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  }
}

// Atualiza ensureModalHtml para animação e responsividade
function ensureModalHtml() {
  if (!document.getElementById("preco-modal")) {
    const modal = document.createElement("div");
    modal.id = "preco-modal";
    modal.className =
      "fixed inset-0 z-50 flex items-center justify-center bg-black/40 hidden";
    modal.innerHTML = `
      <div class='bg-white rounded-2xl shadow-2xl max-w-md w-full relative animate-fade-in'>
        <button onclick='closeModal()' class='absolute top-2 right-2 text-destaque hover:text-black text-2xl' title='Fechar'>&times;</button>
        <div id='preco-modal-content'></div>
      </div>
    `;
    document.body.appendChild(modal);
  }
}

// ============================
// Renderização dinâmica da tabela de preços com busca e clique para detalhes
// ============================
async function renderPrecos() {
  const container = document.getElementById("precos");
  let data = await carregarDadosNormalizados();
  data = filterData(data);
  container.innerHTML = `
    <div class="mb-4 flex flex-col sm:flex-row gap-2 items-center justify-between">
      <input id="search-input" type="text" autocomplete="off" placeholder="Buscar espaço, tipo, equipamento..." class="w-full sm:w-72 px-3 py-2 border border-destaque/20 rounded-lg focus:outline-none focus:ring-destaque bg-white shadow-sm" value="${searchTerm}">
      <button id="clear-search" class="px-4 py-2 rounded-lg bg-destaque text-white font-semibold hover:bg-black/80 transition">Limpar</button>
    </div>
    <table class="min-w-full text-sm text-gray-700">
      <thead><tr class="bg-destaque-grad text-white">
        <th class="p-2">Espaço</th>
        <th class="p-2">Tipo</th>
        <th class="p-2">Capacidade</th>
        <th class="p-2">Meio Dia</th>
        <th class="p-2">Todo Dia</th>
        <th class="p-2">Equipamentos</th>
        <th class="p-2">Detalhes</th>
      </tr></thead>
      <tbody>
        ${data
          .map(
            (e) => `
          <tr class="border-b hover:bg-destaque/10 cursor-pointer">
            <td class="p-2 font-semibold">${e.espaco}</td>
            <td class="p-2">${e.tipo_espaco}</td>
            <td class="p-2">${e.capacidade}</td>
            <td class="p-2">${
              e.preco_meio_dia
                ? parseFloat(e.preco_meio_dia).toLocaleString("pt-PT", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  }) + " AOA"
                : "-"
            }</td>
            <td class="p-2">${
              e.preco_todo_dia
                ? parseFloat(e.preco_todo_dia).toLocaleString("pt-PT", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  }) + " AOA"
                : "-"
            }</td>
            <td class="p-2">${e.equipamentos.join(", ")}</td>
            <td class="p-2"><button class="detalhes-btn px-3 py-1 rounded bg-destaque text-white hover:bg-black/80 transition" data-espaco="${
              e.espaco
            }">Ver</button></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
  // Foco automático e seleção do input ao renderizar
  const searchInput = document.getElementById("search-input");
  searchInput.focus();
  searchInput.setSelectionRange(
    searchInput.value.length,
    searchInput.value.length
  );
  // Evita perder o foco ao digitar rapidamente
  searchInput.addEventListener("blur", (e) => {
    setTimeout(() => {
      if (!document.activeElement.classList.contains("detalhes-btn")) {
        searchInput.focus();
      }
    }, 100);
  });
  searchInput.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderPrecos();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchTerm = "";
      renderPrecos();
    }
  });
  document.getElementById("clear-search").addEventListener("click", () => {
    searchTerm = "";
    renderPrecos();
  });
  document.querySelectorAll(".detalhes-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const espaco = btn.getAttribute("data-espaco");
      const item = data.find((d) => d.espaco === espaco);
      if (item) openModal(item);
    });
  });
}

// ============================
// Função para mostrar skeleton loading
// ============================
function showSkeletons() {
  // Skeleton para tabela de preços
  const precos = document.getElementById("precos");
  precos.innerHTML = `
    <div class="animate-pulse">
      <div class="mb-4 flex flex-col sm:flex-row gap-2 items-center justify-between">
        <div class="h-10 bg-gray-200 rounded w-full sm:w-72"></div>
        <div class="h-10 bg-gray-200 rounded w-24"></div>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead><tr>
            <th class="p-2 bg-gray-200"></th><th class="p-2 bg-gray-200"></th><th class="p-2 bg-gray-200"></th><th class="p-2 bg-gray-200"></th><th class="p-2 bg-gray-200"></th><th class="p-2 bg-gray-200"></th><th class="p-2 bg-gray-200"></th>
          </tr></thead>
          <tbody>
            ${[...Array(5)]
              .map(
                () => `
              <tr>
                ${[...Array(7)]
                  .map(
                    () =>
                      `<td class="p-2"><div class="h-6 bg-gray-200 rounded"></div></td>`
                  )
                  .join("")}
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  // Skeleton para cards de períodos
  const periodos = document.getElementById("periodos");
  periodos.innerHTML = [...Array(3)]
    .map(
      () => `
    <div class="mb-4 p-3 rounded-lg bg-gray-100 border border-destaque/10 shadow animate-pulse">
      <div class="h-5 w-1/2 bg-gray-200 rounded mb-2"></div>
      <div class="h-4 w-1/3 bg-gray-200 rounded"></div>
    </div>
  `
    )
    .join("");
  // Skeleton para cards de espaços
  const espacos = document.getElementById("espacos");
  espacos.innerHTML = [...Array(3)]
    .map(
      () => `
    <div class="mb-4 p-3 rounded-lg bg-gray-100 border border-destaque/10 shadow animate-pulse">
      <div class="h-5 w-1/2 bg-gray-200 rounded mb-2"></div>
      <div class="h-4 w-2/3 bg-gray-200 rounded"></div>
    </div>
  `
    )
    .join("");
}

// ============================
// Inicialização
// ============================
window.addEventListener("DOMContentLoaded", () => {
  ensureModalHtml();
  showSkeletons();
  if (!window.Papa) {
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js";
    script.onload = () => {
      renderPrecos();
      renderPeriodosDisponiveis();
      renderEspacosCards();
    };
    document.body.appendChild(script);
  } else {
    renderPrecos();
    renderPeriodosDisponiveis();
    renderEspacosCards();
  }
});
