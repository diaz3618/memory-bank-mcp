---
name: vscode-extension-dev
description: |
  VS Code extension development expertise covering webview providers, sidebar panels,
  Content Security Policy, MCP client integration, extension packaging, and debugging.
  Use when building, debugging, or fixing VS Code extensions, especially those using
  webviews, WebviewViewProviders, or MCP protocol clients.
  Activates for: vscode.WebviewViewProvider, resolveWebviewView, acquireVsCodeApi,
  Content-Security-Policy in webviews, postMessage/onDidReceiveMessage, vsce package,
  extension.ts activate/deactivate, package.json contributes, sidebar webviews.
allowed-tools: Read, Write, Edit, MultiEdit, Grep, Glob, Bash
---

# VS Code Extension Development Skill

You are an expert VS Code extension developer with deep knowledge of the VS Code Extension API, webview development, MCP protocol integration, and extension packaging/debugging.

## Core Expertise Areas

### 1. Extension Lifecycle

**Activation:**
- `activate(context: vscode.ExtensionContext)` - Entry point; register commands, providers, disposables
- `deactivate()` - Cleanup; disconnect servers, dispose resources
- `activationEvents` in package.json: `onStartupFinished`, `onCommand:...`, `onView:...`, `onLanguage:...`
- Always push disposables to `context.subscriptions` to prevent memory leaks

**Package.json Contributes:**
- `commands` - Register command IDs, titles, icons, categories
- `views` / `viewsContainers` - Register sidebar views, activity bar icons
- `configuration` - Extension settings with types, defaults, descriptions
- `menus` - Command palette, editor context menu, view title actions

### 2. Webview Development (CRITICAL KNOWLEDGE)

**WebviewViewProvider (Sidebar Panels):**
```typescript
class MySidebarProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void {
    // MUST set options BEFORE setting html
    webviewView.webview.options = {
      enableScripts: true,          // REQUIRED for any JavaScript
      localResourceRoots: [...]     // Restricts accessible files
    };
    
    // Register message handler BEFORE setting html to avoid race condition
    webviewView.webview.onDidReceiveMessage(handler);
    
    // Set HTML last - triggers async loading
    webviewView.webview.html = getHtml(webviewView.webview);
  }
}
```

**Registration with retainContextWhenHidden:**
```typescript
vscode.window.registerWebviewViewProvider(
  'viewId',
  provider,
  { webviewOptions: { retainContextWhenHidden: true } }  // Prevents content destruction
);
```

### 3. Content Security Policy (CSP) - CRITICAL RULES

**CSP blocks inline event handlers ALWAYS:**
- `onclick="fn()"`, `onmouseover="..."` etc. are ALWAYS blocked when CSP has `script-src` with nonce
- Nonce-based CSP ONLY allows `<script nonce="...">` blocks, NOT inline event handlers
- **Solution**: Use `addEventListener()` in the script block instead of `onclick` attributes

**Correct CSP template:**
```html
<meta http-equiv="Content-Security-Policy" 
  content="default-src 'none'; 
    style-src ${webview.cspSource} 'unsafe-inline'; 
    script-src 'nonce-${nonce}'; 
    font-src ${webview.cspSource};
    img-src ${webview.cspSource} https:;">
```

**Common CSP mistakes that silently break webviews:**
1. Using `onclick` attributes (blocked by nonce CSP)
2. Missing `'unsafe-inline'` for `style-src` when using inline styles
3. Forgetting `img-src` for any images including data URIs
4. Not matching nonce exactly between meta tag and script tag

### 4. Webview Messaging Pattern

**Extension → Webview:**
```typescript
// Extension side
webviewView.webview.postMessage({ type: 'update', data: {...} });
```

**Webview → Extension:**
```javascript
// Webview side (inside <script nonce="...">)
const vscode = acquireVsCodeApi(); // ONLY call once per session!
vscode.postMessage({ type: 'ready' });
```

**Correct "ready" handshake pattern:**
```javascript
// Webview script
const vscode = acquireVsCodeApi();
window.addEventListener('message', (event) => {
  const msg = event.data;
  // handle messages from extension
});
vscode.postMessage({ type: 'ready' });

// Extension side (in resolveWebviewView)
webview.onDidReceiveMessage((msg) => {
  if (msg.type === 'ready') {
    // Send initial data
    webview.postMessage({ type: 'status', data: {...} });
  }
});
```

**CRITICAL: `acquireVsCodeApi()` rules:**
- Can ONLY be called ONCE per webview session
- Calling it twice throws an error
- Store the result and share it (don't make it global)
- Returns `{ postMessage(), getState(), setState() }`

### 5. Common Webview Bugs & Solutions

**Bug: Webview shows initial HTML but never updates**
- Cause 1: CSP blocking inline scripts/onclick handlers
- Cause 2: `enableScripts: true` not set in webview options
- Cause 3: Message handler registered AFTER HTML is set (race condition)
- Cause 4: `postMessage()` called when webview is disposed/hidden
- Solution: Check DevTools console (`Developer: Toggle Developer Tools`), register handler before HTML, use ready handshake

**Bug: Buttons don't respond to clicks**
- Cause: `onclick` attributes blocked by CSP nonce policy
- Solution: Replace ALL `onclick="fn()"` with `element.addEventListener('click', fn)`
- Example fix:
  ```html
  <!-- BAD: blocked by CSP -->
  <button onclick="refresh()">Refresh</button>
  
  <!-- GOOD: works with CSP nonce -->
  <button id="refreshBtn">Refresh</button>
  <script nonce="${nonce}">
    document.getElementById('refreshBtn').addEventListener('click', refresh);
  </script>
  ```

**Bug: Webview content lost when panel hidden**
- Cause: Webview content is destroyed when moved to background
- Solution: Use `retainContextWhenHidden: true` in registration options
- Alternative: Use `getState()`/`setState()` for persistence

**Bug: postMessage sent but webview doesn't receive**
- Cause: Message sent before webview script loaded
- Solution: Use ready handshake - webview sends 'ready', extension responds with data

### 6. Debugging VS Code Extensions

**Developer Tools:**
- `Developer: Toggle Developer Tools` - Chrome DevTools for webviews
- Select the active webview frame from the DevTools console dropdown
- Check Console tab for CSP violations, JS errors
- Check Network tab for failed resource loads (404s)
- `Developer: Reload Webview` - Reloads all active webviews

**Extension Host Output:**
- Output panel → "Extension Host" channel for activation errors
- Create dedicated `OutputChannel` for extension logging
- `outputChannel.appendLine()` for persistent debug logging

**Common Debugging Commands:**
```
Developer: Toggle Developer Tools    - Inspect webview DOM/console
Developer: Reload Webview           - Reset webview content
Developer: Reload Window            - Full extension reload
Extensions: Show Running Extensions - Check activation status
```

### 7. Extension Packaging

**Using vsce:**
```bash
npx @vscode/vsce package           # Create .vsix
npx @vscode/vsce publish           # Publish to marketplace
code --install-extension file.vsix  # Install locally
```

**esbuild for bundling:**
```javascript
// esbuild.js
require('esbuild').build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
});
```

### 8. MCP Client Integration Pattern

**StdioMcpClient for MCP server communication:**
- Spawn server as child process with `child_process.spawn()`
- Communicate via JSON-RPC 2.0 over stdin/stdout
- Always send `initialize` request first, then `notifications/initialized`
- Use `tools/call` for tool invocations, extract `content[0].text`
- Parse tool results: try JSON.parse, fall back to raw string

**MCP Initialization sequence:**
1. Spawn process
2. Send `initialize` with protocolVersion, capabilities, clientInfo
3. Send `notifications/initialized` notification
4. THEN call `initialize_memory_bank(path)` or first tool

### 9. Best Practices Checklist

- [ ] All webview scripts use `addEventListener`, never `onclick` attributes
- [ ] CSP includes correct nonce, `'unsafe-inline'` for styles only
- [ ] `enableScripts: true` set in webview options
- [ ] Message handler registered BEFORE HTML is assigned
- [ ] `acquireVsCodeApi()` called exactly once
- [ ] Ready handshake pattern implemented
- [ ] `retainContextWhenHidden: true` for sidebar webviews
- [ ] All disposables pushed to `context.subscriptions`
- [ ] `localResourceRoots` includes all needed directories
- [ ] Error handling in all message handlers (try/catch)

### 10. Useful VS Code API Reference

**Key APIs for webview extensions:**
- `vscode.window.registerWebviewViewProvider()` - Register sidebar webview
- `vscode.window.createOutputChannel()` - Debug logging
- `vscode.workspace.getConfiguration()` - Read extension settings
- `vscode.workspace.workspaceFolders` - Get workspace root paths
- `vscode.commands.registerCommand()` - Register command handlers
- `vscode.window.showInformationMessage()` - User notifications
- `vscode.Uri.joinPath()` / `webview.asWebviewUri()` - Resource URIs
- `vscode.EventEmitter` - Custom events for service→provider communication
