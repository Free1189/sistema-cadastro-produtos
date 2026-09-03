if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const API_URL = '';
const clienteForm = document.getElementById('clienteForm');
const buscaCliente = document.getElementById('buscaCliente');
const listaClientes = document.getElementById('listaClientes');
const totalClientes = document.getElementById('totalClientes');
const mensagemCliente = document.getElementById('mensagemCliente');
const btnSalvarCliente = document.getElementById('btnSalvarCliente');
const btnCancelarEdicao = document.getElementById('btnCancelarEdicao');
let clienteEditando = null;

function formatarNome(nome) {
  return nome
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|\s)(\p{L})/gu, (trecho, espaco, letra) => `${espaco}${letra.toLocaleUpperCase('pt-BR')}`);
}

function formatarTextoEndereco(texto) {
  return texto
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|\s)(\p{L})/gu, (trecho, espaco, letra) => `${espaco}${letra.toLocaleUpperCase('pt-BR')}`);
}

function formatarCpf(valor) {
  const numeros = valor.replace(/\D/g, '').slice(0, 11);
  return numeros
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function formatarCpfCnpj(valor) {
  const numeros = valor.replace(/\D/g, '').slice(0, 14);
  if (numeros.length > 11) {
    return numeros
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
  return formatarCpf(numeros);
}

function documentoValido(documento) {
  const numeros = documento.replace(/\D/g, '');
  if (/^(\d)\1+$/.test(numeros)) return false;

  if (numeros.length === 11) {
    const calcular = (tamanho) => {
      const soma = numeros.slice(0, tamanho).split('').reduce((total, numero, indice) => total + Number(numero) * (tamanho + 1 - indice), 0);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return calcular(9) === Number(numeros[9]) && calcular(10) === Number(numeros[10]);
  }

  if (numeros.length === 14) {
    const calcular = (base, pesos) => {
      const soma = base.split('').reduce((total, numero, indice) => total + Number(numero) * pesos[indice], 0);
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const primeiro = calcular(numeros.slice(0, 12), pesos.slice(1));
    const segundo = calcular(numeros.slice(0, 12) + primeiro, pesos);
    return primeiro === Number(numeros[12]) && segundo === Number(numeros[13]);
  }

  return false;
}

function formatarTelefone(valor) {
  const numeros = valor.replace(/\D/g, '').slice(0, 11);
  return numeros
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

const nomeCliente = document.getElementById('nomeCliente');
const cpfCliente = document.getElementById('cpfCliente');
const telefoneCliente = document.getElementById('telefoneCliente');
const cidadeCliente = document.getElementById('cidadeCliente');
const ruaCliente = document.getElementById('ruaCliente');
const bairroCliente = document.getElementById('bairroCliente');
nomeCliente.addEventListener('input', () => { nomeCliente.value = formatarNome(nomeCliente.value); });
cpfCliente.addEventListener('input', () => { cpfCliente.value = formatarCpfCnpj(cpfCliente.value); });
telefoneCliente.addEventListener('input', () => { telefoneCliente.value = formatarTelefone(telefoneCliente.value); });
cidadeCliente.addEventListener('input', () => { cidadeCliente.value = formatarTextoEndereco(cidadeCliente.value); });
ruaCliente.addEventListener('input', () => { ruaCliente.value = formatarTextoEndereco(ruaCliente.value); });
bairroCliente.addEventListener('input', () => { bairroCliente.value = formatarTextoEndereco(bairroCliente.value); });

async function carregarClientes() {
  const resposta = await fetch(`${API_URL}/clientes?busca=${encodeURIComponent(buscaCliente.value.trim())}`);
  const clientes = await resposta.json();
  listaClientes.innerHTML = '';
  totalClientes.textContent = `${clientes.length} cliente(s)`;

  clientes.forEach((cliente) => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>${cliente.nome}</td>
      <td>${cliente.cpf || '-'}</td>
      <td>${cliente.telefone || '-'}</td>
      <td>
        <button type="button" class="btn-editar-cliente" data-id="${cliente.id}">Editar</button>
        <button type="button" class="btn-excluir-cliente" data-id="${cliente.id}">Excluir</button>
      </td>
    `;
    listaClientes.appendChild(linha);
  });

  listaClientes.querySelectorAll('.btn-editar-cliente').forEach((botao) => {
    botao.addEventListener('click', () => editarCliente(botao.dataset.id));
  });
  listaClientes.querySelectorAll('.btn-excluir-cliente').forEach((botao) => {
    botao.addEventListener('click', () => excluirCliente(botao.dataset.id));
  });
}

async function editarCliente(id) {
  const resposta = await fetch(`${API_URL}/clientes/${id}`);
  const cliente = await resposta.json();
  if (!resposta.ok) return;

  clienteEditando = id;
  nomeCliente.value = cliente.nome || '';
  cpfCliente.value = cliente.cpf || '';
  telefoneCliente.value = cliente.telefone || '';
  document.getElementById('cidadeCliente').value = cliente.cidade || '';
  document.getElementById('ruaCliente').value = cliente.rua || '';
  document.getElementById('numeroCliente').value = cliente.numero || '';
  document.getElementById('bairroCliente').value = cliente.bairro || '';
  btnSalvarCliente.textContent = 'Atualizar cliente';
  btnCancelarEdicao.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function excluirCliente(id) {
  if (!confirm('Tem certeza que deseja excluir este cliente?')) return;

  const resposta = await fetch(`${API_URL}/clientes/${id}`, { method: 'DELETE' });
  if (!resposta.ok) {
    const resultado = await resposta.json();
    mensagemCliente.textContent = resultado.err || 'Não foi possível excluir o cliente.';
    return;
  }

  mensagemCliente.textContent = 'Cliente excluído com sucesso.';
  carregarClientes();
}

function cancelarEdicao() {
  clienteEditando = null;
  clienteForm.reset();
  btnSalvarCliente.textContent = 'Salvar cliente';
  btnCancelarEdicao.hidden = true;
}

clienteForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mensagemCliente.textContent = '';

  if (!clienteForm.checkValidity()) {
    clienteForm.reportValidity();
    return;
  }

  if (!documentoValido(cpfCliente.value)) {
    mensagemCliente.textContent = 'Digite um CPF ou CNPJ válido.';
    cpfCliente.focus();
    return;
  }

  const resposta = await fetch(
    clienteEditando ? `${API_URL}/clientes/${clienteEditando}` : `${API_URL}/clientes`,
    {
      method: clienteEditando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: formatarNome(nomeCliente.value.trim()),
        cpf: cpfCliente.value.trim(),
        telefone: telefoneCliente.value.trim(),
        cidade: formatarTextoEndereco(cidadeCliente.value.trim()),
        rua: formatarTextoEndereco(ruaCliente.value.trim()),
        numero: document.getElementById('numeroCliente').value.trim(),
        bairro: formatarTextoEndereco(bairroCliente.value.trim())
      })
    }
  );
  const resultado = await resposta.json();

  if (!resposta.ok) {
    mensagemCliente.textContent = resultado.err || 'Não foi possível salvar o cliente.';
    return;
  }

  mensagemCliente.textContent = clienteEditando ? 'Cliente atualizado com sucesso.' : 'Cliente cadastrado com sucesso.';
  cancelarEdicao();
  carregarClientes();
});

clienteForm.querySelectorAll('input').forEach((campo, indice, campos) => {
  campo.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    const proximo = campos[indice + 1];
    if (proximo) proximo.focus();
  });
});

buscaCliente.addEventListener('input', carregarClientes);
btnCancelarEdicao.addEventListener('click', cancelarEdicao);
document.getElementById('btnVoltar').addEventListener('click', () => {
  window.location.href = 'hub.html';
});

carregarClientes();
