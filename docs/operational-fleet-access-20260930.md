# Acesso do Operacional e alinhamento de despesas

O botão Novo frete já era exibido na Frota para o Operacional, mas a API de criação recusava o perfil. Agora a API de criação e suas opções permitem esse acesso. A capacidade CREATE_FLEET_SALE também permite a venda comercial Frota; Cegonha continua disponível.

O servidor usa a identidade do usuário logado e comissão zero para o Operacional. Valores de vendedor e comissão enviados manualmente não prevalecem. Os formulários e respostas da API continuam ocultando a comissão desse perfil. A consulta das vendas/fretes continua limitada ao próprio usuário.

Clientes e Prestadores aparecem no menu do Operacional. Clientes podem ser consultados e cadastrados; edição/exclusão continuam restritas ao administrador. Prestadores seguem o acesso de consulta já usado pelo vendedor. Não foram liberados gestão de usuários, recebimentos, exclusões ou relatórios financeiros.

A linha Outras despesas passa a seguir as mesmas colunas e alinhamento das demais despesas, inclusive no celular.

Não há alteração de esquema ou migração de banco nesta atualização. As permissões são aplicadas no código.

Validação: suíte de integração com criação real via handlers/SQL, comissão zero mesmo com payload forjado, escopo próprio, cadastro de cliente, consulta de prestadores e manutenção das proibições de exclusão/vínculo administrativo. Build/TypeScript e lint. Conferência do formulário e navegação no navegador com perfil Operacional em desktop e celular.
