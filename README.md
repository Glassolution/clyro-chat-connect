# Clyro Connect

Crie uma nova aplicação chamada Clyro — uma plataforma de comunicação em tempo real inspirada no Discord, mas com identidade visual própria (baseada no logo anexado: ícone de balão de chat preto com um "+", duas barrinhas brancas dentro, tipografia geométrica arredondada, fundo claro/neutro).

A referência de estrutura e fluxo é a segunda imagem anexada (interface do Discord) — rail de servidores à esquerda, lista de amigos/DMs, painel central de conversa, painel "Ativo agora" à direita. Adapte essa estrutura à identidade do Clyro: paleta preto/branco/cinza, visual mais clean e minimalista que o Discord, sem copiar as cores roxas dele.

Funcionalidades principais:

Autenticação com perfil, avatar e status (online, ausente, não perturbe, invisível)

Criação e participação em servidores, cada um com múltiplos canais de texto e voz

Lista de amigos com pedidos pendentes, e mensagens diretas (1:1 e em grupo)

Chat em tempo real, com histórico, timestamps e indicador de "digitando..."

Canais de voz com múltiplos participantes simultâneos, indicador de quem está falando, controles de mudo/surdo

Chamadas de voz e vídeo diretamente nas DMs

Compartilhamento de tela — em canais de voz e em chamadas diretas, visível para os outros participantes

Painel "Ativo agora" mostrando o que os amigos estão fazendo no momento

Para voz, vídeo e compartilhamento de tela em tempo real é necessária uma infraestrutura WebRTC de verdade — isso vai além de CRUD simples de banco de dados, então escolha a solução que melhor se encaixa no seu stack para viabilizar isso.

Priorize navegação fluida entre servidores, canais e DMs, como no Discord, mas com a estética minimalista do Clyro.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://clyro-chat-connect.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ed0bd955-cefb-47b0-abcb-1e7aa8634284).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
