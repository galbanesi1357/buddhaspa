# Guia de Rua

Assistente de localização e viagem para o celular. Ele usa o GPS, o mapa e, quando você liga, a câmera para responder onde você está, o que há por perto e como chegar. Durante o trajeto ele fala as conversões em voz alta usando referências que aparecem na câmera ("vire à direita logo depois do prédio azul").

## O que ele faz

- **Onde estou:** endereço, bairro e cidade a partir do GPS. O botão de mira no canto do mapa volta o mapa para a sua posição e faz ele acompanhar você de novo.
- **O que tem por perto:** restaurantes, cafés, farmácias, mercados, caixas eletrônicos, postos, transporte, pontos turísticos e outros, com distância e direção.
- **Me leve até…:** procura o lugar, traça a rota (a pé, de carro ou de bicicleta) e guia passo a passo. Se você sair da rota, ele recalcula.
- **Câmera:** com a câmera ligada, o Claude olha a cena perto de cada conversão e na chegada para dar referências visuais. O botão **Olhar** pede uma descrição na hora.
- **Voz:** o botão do alto-falante liga a fala, e todas as respostas e avisos de rota passam a ser lidos em voz alta, em 1,5x por padrão (a velocidade muda em Ajustes, de 1x a 2x). O botão do microfone deixa você perguntar falando.

## Como usar

1. Abra o endereço publicado no navegador do celular (Chrome no Android ou Safari no iPhone). É preciso usar **https**, porque sem ele o celular bloqueia o GPS e a câmera.
2. Em **Ajustes**, cole sua chave da API da Anthropic (crie em console.anthropic.com → API Keys) e escolha como vai se deslocar.
3. Permita a localização. Ligue a voz e a câmera quando quiser.
4. No iPhone, use Compartilhar → "Adicionar à Tela de Início" para abrir como app.

## Publicar no GitHub Pages

No repositório, abra **Settings → Pages**, escolha "Deploy from a branch", selecione o branch e a pasta `/ (root)` e salve. Depois de um ou dois minutos o app fica em:

`https://galbanesi1357.github.io/buddhaspa/guia/`

## Custos e privacidade

- Mapa, endereços, lugares e rotas vêm do OpenStreetMap (Nominatim, Overpass e roteamento FOSSGIS), que são gratuitos. Esses serviços públicos têm limite de uso justo e servem bem para uso pessoal.
- As respostas do Claude são cobradas na sua conta da Anthropic. Cada pergunta com imagem custa poucos centavos de dólar. Durante uma rota com câmera, ele consulta o Claude perto de cada conversão. Defina um limite de gastos no console.
- A chave da API fica salva apenas no navegador deste celular e é enviada direto para a Anthropic. Não use esse modo em um site aberto a outras pessoas, porque qualquer pessoa com acesso ao aparelho pode ver a chave.
- As imagens da câmera vão para o Claude só no momento da pergunta e não ficam guardadas pelo app.

## Limitações

- O GPS do celular erra de 5 a 15 metros na cidade. Por isso as referências visuais ajudam.
- A análise da câmera leva alguns segundos. Serve bem para quem está a pé. No carro, deixe a câmera em um suporte e não olhe a tela.
- No iPhone, o reconhecimento de fala do navegador pode falhar. Nesse caso, use o microfone do teclado.
- A tela precisa ficar ligada durante a rota. O app pede para a tela não apagar quando o navegador permite.

## Arquivos

- `index.html`: interface.
- `app.js`: GPS, mapa, rotas, câmera, voz e conversa com o Claude (modelo `claude-opus-5-5`).
- `vendor/`: SDK da Anthropic empacotado para navegador (versão 0.131.0) e Leaflet 1.9.4 (mapa).
