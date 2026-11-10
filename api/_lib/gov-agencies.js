// ---------------------------------------------------------------------------
// Base de instituições governamentais verificadas, usada para montar os
// blocos <card> do protocolo GOV-CARD v1.0.
//
// ⚠️ DETRAN e TRE seguem o padrão oficial de nomenclatura do governo
// (detran.<uf>.gov.br / tre-<uf>.jus.br). Valide os domínios antes de
// produção — alguns estados podem ter migrado para subdomínios diferentes.
// ---------------------------------------------------------------------------

const UFS = [
  { uf: 'ac', nome: 'Acre' }, { uf: 'al', nome: 'Alagoas' }, { uf: 'ap', nome: 'Amapá' },
  { uf: 'am', nome: 'Amazonas' }, { uf: 'ba', nome: 'Bahia' }, { uf: 'ce', nome: 'Ceará' },
  { uf: 'df', nome: 'Distrito Federal' }, { uf: 'es', nome: 'Espírito Santo' }, { uf: 'go', nome: 'Goiás' },
  { uf: 'ma', nome: 'Maranhão' }, { uf: 'mt', nome: 'Mato Grosso' }, { uf: 'ms', nome: 'Mato Grosso do Sul' },
  { uf: 'mg', nome: 'Minas Gerais' }, { uf: 'pa', nome: 'Pará' }, { uf: 'pb', nome: 'Paraíba' },
  { uf: 'pr', nome: 'Paraná' }, { uf: 'pe', nome: 'Pernambuco' }, { uf: 'pi', nome: 'Piauí' },
  { uf: 'rj', nome: 'Rio de Janeiro' }, { uf: 'rn', nome: 'Rio Grande do Norte' }, { uf: 'rs', nome: 'Rio Grande do Sul' },
  { uf: 'ro', nome: 'Rondônia' }, { uf: 'rr', nome: 'Roraima' }, { uf: 'sc', nome: 'Santa Catarina' },
  { uf: 'sp', nome: 'São Paulo' }, { uf: 'se', nome: 'Sergipe' }, { uf: 'to', nome: 'Tocantins' },
]

const DETRANS = UFS.map(({ uf, nome }) => ({
  title: `DETRAN-${uf.toUpperCase()}`,
  description: 'Habilitação, veículos e multas de trânsito',
  source: `DETRAN ${nome}`,
  url: `https://www.detran.${uf}.gov.br`,
  uf: uf.toUpperCase(),
}))

const TRES = UFS.map(({ uf, nome }) => ({
  title: `TRE-${uf.toUpperCase()}`,
  description: 'Título de eleitor e justiça eleitoral',
  source: `TRE ${nome}`,
  url: `https://www.tre-${uf}.jus.br`,
  uf: uf.toUpperCase(),
}))

const FEDERAIS = [
  { title: 'Receita Federal do Brasil', description: 'Imposto de Renda, CPF e tributos federais', source: 'Receita Federal', url: 'https://www.gov.br/receitafederal/pt-br', uf: null },
  { title: 'Instituto Nacional do Seguro Social', description: 'Aposentadoria, benefícios e perícias do INSS', source: 'INSS', url: 'https://www.gov.br/inss/pt-br', uf: null },
  { title: 'Ministério da Saúde', description: 'Políticas de saúde e acesso ao SUS', source: 'Ministério da Saúde', url: 'https://www.gov.br/saude/pt-br', uf: null },
  { title: 'Caixa Econômica Federal', description: 'FGTS, Bolsa Família e benefícios sociais', source: 'Caixa', url: 'https://www.caixa.gov.br', uf: null },
  { title: 'Ministério do Trabalho e Emprego', description: 'Direitos trabalhistas e seguro-desemprego', source: 'MTE', url: 'https://www.gov.br/trabalho-e-emprego/pt-br', uf: null },
  { title: 'Polícia Federal', description: 'Passaporte, antecedentes e vistos', source: 'Polícia Federal', url: 'https://www.gov.br/pf/pt-br', uf: null },
  { title: 'Polícia Rodoviária Federal', description: 'Segurança e ocorrências em rodovias federais', source: 'PRF', url: 'https://www.gov.br/prf/pt-br', uf: null },
  { title: 'Consumidor.gov.br', description: 'Reclamações contra empresas e serviços', source: 'Senacon/MJ', url: 'https://www.consumidor.gov.br', uf: null },
  { title: 'Procon-SP', description: 'Defesa do consumidor no estado de São Paulo', source: 'Procon-SP', url: 'https://www.procon.sp.gov.br', uf: 'SP' },
  { title: 'Correios', description: 'Rastreamento, reclamações e serviços postais', source: 'Correios', url: 'https://www.correios.com.br', uf: null },
  { title: 'ANATEL', description: 'Reclamações sobre telefonia e internet', source: 'ANATEL', url: 'https://www.gov.br/anatel/pt-br', uf: null },
  { title: 'ANEEL', description: 'Reclamações sobre energia elétrica', source: 'ANEEL', url: 'https://www.gov.br/aneel/pt-br', uf: null },
  { title: 'ANVISA', description: 'Vigilância sanitária e medicamentos', source: 'ANVISA', url: 'https://www.gov.br/anvisa/pt-br', uf: null },
  { title: 'IBAMA', description: 'Licenciamento e infrações ambientais', source: 'IBAMA', url: 'https://www.gov.br/ibama/pt-br', uf: null },
  { title: 'Ministério do Desenvolvimento Social', description: 'CadÚnico e programas sociais', source: 'MDS', url: 'https://www.gov.br/mds/pt-br', uf: null },
  { title: 'Defensoria Pública da União', description: 'Assistência jurídica gratuita federal', source: 'DPU', url: 'https://www.gov.br/dpu/pt-br', uf: null },
  { title: 'Disque Direitos Humanos', description: 'Denúncias de violação de direitos humanos', source: 'Disque 100', url: 'https://www.gov.br/mdh/pt-br', uf: null },
  { title: 'Tribunal Superior Eleitoral', description: 'Serviços eleitorais e título de eleitor', source: 'TSE', url: 'https://www.tse.jus.br', uf: null },
  { title: 'Ministério das Relações Exteriores', description: 'Passaporte e serviços consulares no exterior', source: 'Itamaraty', url: 'https://www.gov.br/mre/pt-br', uf: null },
  { title: 'Ministério da Educação', description: 'ENEM, FIES, SISU e políticas educacionais', source: 'MEC', url: 'https://www.gov.br/mec/pt-br', uf: null },
  { title: 'Ministério das Cidades', description: 'Habitação e programas de moradia', source: 'Ministério das Cidades', url: 'https://www.gov.br/cidades/pt-br', uf: null },
  { title: 'ANAC', description: 'Reclamações sobre voos e companhias aéreas', source: 'ANAC', url: 'https://www.gov.br/anac/pt-br', uf: null },
  { title: 'ANTT', description: 'Transporte rodoviário interestadual e fretes', source: 'ANTT', url: 'https://www.gov.br/antt/pt-br', uf: null },
  { title: 'Banco Central do Brasil', description: 'Reclamações contra bancos e financeiras', source: 'Banco Central', url: 'https://www.bcb.gov.br', uf: null },
  { title: 'Portal gov.br de Serviços', description: 'Busca oficial por qualquer serviço público', source: 'gov.br', url: 'https://www.gov.br/pt-br/servicos', uf: null },
]

export const GOV_AGENCIES = [...FEDERAIS, ...DETRANS, ...TRES]