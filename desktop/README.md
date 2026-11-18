# Clyro para computador

App em Electron que abre o Clyro publicado (https://clyro-chat-connect.lovable.app) já no
workspace. Toda atualização do site chega no app sem reinstalar.

No app aparecem só o login, as comunidades (`/buscar`, `/p/…`, convites) e o workspace,
com a sidebar sempre minimizada. O resto do site leva para o workspace.

## Rodar

```bash
cd desktop
npm install
npm start          # abre o site publicado
npm run dev        # abre o `npm run dev` da raiz (localhost:8080)
```

## Gerar o instalador

```bash
npm run dist:mac   # .dmg em desktop/release
npm run dist:win   # instalador .exe
```

Saem `release/Clyro-mac.dmg` (universal: Intel e Apple Silicon) e
`release/Clyro-windows-x64.exe`. Mac e Windows entram nas mesmas calls: o app é o mesmo site,
e quem está no navegador também conversa com quem está no app.

## Publicar uma versão

O site oferece o download certo para o sistema de cada pessoa ("Baixar para Mac/Windows")
apontando para a última release do GitHub. Para publicar uma versão nova, suba os dois arquivos
com os mesmos nomes:

```bash
gh release create desktop-v0.1.0 desktop/release/Clyro-mac.dmg desktop/release/Clyro-windows-x64.exe --repo Glassolution/clyro-chat-connect --title "Clyro para computador 0.1.0"
```

Sem certificado de assinatura, o primeiro uso pede um passo a mais:

- **Mac:** clique direito no Clyro › Abrir › Abrir. Se aparecer "está danificado", rode
  `xattr -cr /Applications/Clyro.app`. Some com um certificado Apple Developer (US$ 99/ano).
- **Windows:** o SmartScreen mostra "O Windows protegeu o computador" › Mais informações ›
  Executar assim mesmo. Some com um certificado de assinatura de código.

## O que o app melhora em relação ao navegador

- A call não desacelera com a janela atrás de outra: sem `backgroundThrottling` e sem
  congelamento de janela coberta. No navegador é daí que vem boa parte dos cortes e do atraso.
- No macOS, sem App Nap durante o uso.
- Áudio sem bloqueio de autoplay; microfone, câmera e tela liberados uma vez só.
- Seletor próprio de tela e janela.
- O som da tela compartilhada fica de fora: o Electron não tem como tirar a voz da call
  do som do computador, e ela voltaria como eco.
