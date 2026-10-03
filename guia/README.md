# Guia de Rua

Assistente de localização e viagem para o celular. Ele usa o GPS, o mapa e, quando você liga, a câmera para responder onde você está, o que há por perto e como chegar. Durante o trajeto ele fala as conversões em voz alta usando referências que aparecem na câmera ("vire à direita logo depois do prédio azul").

## O que ele faz

- **Onde estou:** endereço, bairro e cidade a partir do GPS. O botão de mira no canto do mapa volta o mapa para a sua posição e faz ele acompanhar você de novo.
- **O que tem por perto:** restaurantes, cafés, farmácias, mercados, caixas eletrônicos, postos, transporte, pontos turísticos e outros, com distância e direção.
- **Me leve até…:** procura o lugar, traça a rota (a pé, de carro ou de bicicleta) e guia passo a passo. Se você sair da rota, ele recalcula. Por padrão os avisos de conversão aparecem só na tela, sem falar; para ouvi-los, ligue "Avisos de navegação" em Ajustes ou peça no chat ("fala as conversões").
- **Câmera:** com a câmera ligada, o Claude olha a cena perto de cada conversão e na chegada para dar referências visuais. O botão **Olhar** pede uma descrição na hora.
- **Guia ao vivo:** o botão no alto do mapa liga uma narração contínua. O Claude olha pela câmera, cruza a imagem com os pontos de interesse do mapa num raio de 350 m (monumentos, igrejas, museus, prédios históricos, parques, restaurantes, shoppings) e vai contando o que há em volta: "aquele prédio suspenso é o MASP…". Por padrão ele não diz para onde olhar ou virar; se quiser, ligue "indicar para onde olhar" em Ajustes ou peça no chat ("quero as direções"). Ele não repete o que já contou e só para quando você toca no botão de novo. Usa a bússola do celular para saber para onde você está olhando. No ritmo contínuo ele faz uma nova leitura da câmera a cada 10 segundos, já preparando a próxima fala enquanto ainda está falando, e dá destaque ao que vem pela frente no caminho. O ritmo (contínuo, normal ou calmo) muda em Ajustes.
- **Voz:** o botão do alto-falante liga a fala, e todas as respostas e avisos de rota passam a ser lidos em voz alta, em 1,5x por padrão. O botão **1x / 1,25x / 1,5x / 2x** na barra de baixo troca a velocidade a qualquer momento, continuando a leitura do ponto onde estava, e você também pode pedir no chat ("fala mais devagar"). O botão do microfone deixa você perguntar falando.

## Diário de viagem

Enquanto você usa o app, ele guarda **só no celular** o trajeto do GPS, o que o guia contou, as perguntas e respostas, as fotos que foram para o Claude, notas e clipes de vídeo curtos (automáticos no guia ao vivo, ou no botão **● Gravar 10 s** sobre a câmera).

- **Anotar:** conte no chat o que está fazendo ("anota que almoçamos no mercado municipal") ou use o campo de nota no Diário. As notas são a parte mais importante do relatório.
- **Gerar relatório:** em **Diário → Novo relatório**, escolha as datas e toque em **Gerar relatório**, ou peça no chat ("faz o relatório do dia 1 ao dia 4"). O Claude escreve o resumo da viagem, os destaques de cada dia com fotos e clipes, as curiosidades do caminho, e o app mostra o mapa do trajeto, os km e as paradas.
- **Histórico:** em **Diário → Relatórios** ficam todos os relatórios, com capa e resumo. Cada um pode ser marcado como **Permanente** (não pode ser excluído sem desmarcar antes) ou **Excluído**, sempre com confirmação.
- **Exportar:** gera um arquivo `.html` único com texto, fotos, clipes e o desenho do trajeto, para salvar em Arquivos, mandar para alguém ou trazer para o Claude montar uma apresentação.
- **Guardar ou descartar:** ao desligar o Guia ao vivo, o app pergunta se aquela gravação fica no diário (Guardar), se é apagada (Descartar; as notas escritas são mantidas) ou se você decide depois. Se fechar o app sem responder, ele pergunta na próxima vez.
- **Memória:** o guia lembra o que já contou em passeios guardados. Ao passar de novo por um lugar, ele não repete e faz referência ("como te contei no dia 12…"), trazendo algo novo. No chat, peça "explica de novo" quando quiser a explicação completa, ou "o que você me contou sobre o MASP?".
- **Fotos da galeria:** em **Diário → Novo relatório**, escreva a nota e toque em **📷 Adicionar fotos da galeria** para anexar fotos tiradas com a câmera normal do celular.
- **Foto:** com a câmera ligada, o botão **◉ Foto** guarda o momento no diário; essas fotos têm prioridade no relatório.
- Desligue em **Ajustes → Diário de viagem** se não quiser guardar nada.

## Voz mais natural

O app usa as vozes instaladas no celular e escolhe sozinho a mais natural em português do Brasil. Em **Ajustes → Voz** dá para escolher outra e tocar em **Testar**. Para ter vozes bem melhores:

- **iPhone:** Ajustes → Acessibilidade → Conteúdo Falado → Vozes → Português (Brasil). Baixe uma voz "Aprimorada" ou "Premium" (Luciana ou Felipe).
- **Android:** instale ou atualize "Serviços de fala do Google" e, em Configurações → Conversão de texto em voz, baixe o português (Brasil).

### Voz de IA (OpenAI, opcional)

Para uma voz neural, bem mais natural, cole uma chave da OpenAI em **Ajustes → Voz natural de IA**, escolha a voz e toque em **Testar**. Cada frase é gerada pelo modelo `gpt-4o-mini-tts`, com sotaque brasileiro. O custo é cobrado pela OpenAI, cerca de US$ 1 por hora de fala. Se a chave falhar ou acabarem os créditos, o app avisa e volta para a voz do celular.

## Como usar

1. Abra o endereço publicado no navegador do celular (Chrome no Android ou Safari no iPhone). É preciso usar **https**, porque sem ele o celular bloqueia o GPS e a câmera.
2. Em **Ajustes**, cole sua chave da API da Anthropic (crie em console.anthropic.com → API Keys) e escolha como vai se deslocar.
3. Permita a localização. Ligue a voz e a câmera quando quiser.
4. No iPhone, use Compartilhar → "Adicionar à Tela de Início" para abrir como app.

## Publicar no GitHub Pages

No repositório, abra **Settings → Pages**, escolha "Deploy from a branch", selecione o branch e a pasta `/ (root)` e salve. Depois de um ou dois minutos o app fica em:

`https://galbanesi1357.github.io/buddhaspa/guia/`

## Atualizações

O GitHub Pages deixa o navegador guardar a página por até 10 minutos. Se uma novidade não aparecer, abra o endereço com `?v=` e um número qualquer no fim (por exemplo `.../guia/?v=16`) ou feche e abra a aba de novo. Ao mudar `app.js`, aumente o número em `app.js?v=` no `index.html`.

## Custos e privacidade

- Mapa, endereços, lugares e rotas vêm do OpenStreetMap (Nominatim, Overpass e roteamento FOSSGIS), que são gratuitos. Esses serviços públicos têm limite de uso justo e servem bem para uso pessoal.
- As respostas do Claude são cobradas na sua conta da Anthropic. Cada pergunta com imagem custa poucos centavos de dólar. Durante uma rota com câmera, ele consulta o Claude perto de cada conversão. Defina um limite de gastos no console.
- A chave da API fica salva apenas no navegador deste celular e é enviada direto para a Anthropic. Não use esse modo em um site aberto a outras pessoas, porque qualquer pessoa com acesso ao aparelho pode ver a chave.
- Com os avisos de navegação silenciados, a rota não consulta o Claude pela câmera nas conversões, o que economiza.
- O **Guia ao vivo** consulta o Claude a cada fala: no modo contínuo são 6 consultas por minuto, o que dá uns 4 a 6 dólares por hora de passeio. Nos modos normal e calmo sai bem mais barato.
- A chave da OpenAI, se usada, também fica só neste navegador e vai direto para a OpenAI, junto com o texto de cada fala.
- As imagens da câmera vão para o Claude no momento da pergunta. Com o diário ligado, uma cópia fica guardada só neste celular; gerar um relatório envia ao Claude o texto do período e até 16 fotos (cerca de US$ 0,10 a 0,40 por relatório).
- O iPhone pode apagar dados de sites que ficam semanas sem uso. Adicione o app à Tela de Início e exporte os relatórios importantes.

## Limitações

- O GPS do celular erra de 5 a 15 metros na cidade. Por isso as referências visuais ajudam.
- A análise da câmera leva alguns segundos. Serve bem para quem está a pé. No carro, deixe a câmera em um suporte e não olhe a tela.
- No iPhone, o reconhecimento de fala do navegador pode falhar. Nesse caso, use o microfone do teclado.
- A tela precisa ficar ligada durante a rota. O app pede para a tela não apagar quando o navegador permite.

## Arquivos

- `index.html`: interface.
- `app.js`: GPS, mapa, rotas, câmera, voz e conversa com o Claude (modelo `claude-opus-5-5`).
- `vendor/`: SDK da Anthropic empacotado para navegador (versão 0.131.0) e Leaflet 1.9.4 (mapa).
