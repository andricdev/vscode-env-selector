// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';

async function asyncForEach(array: readonly any[], callback: Function) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  // console.log('Congratulations, your extension "vscode-env-selector" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand('envSelector.selectEnv', async () => {
    // The code you place here will be executed every time your command is executed

    if (vscode.workspace.workspaceFolders) {
      const uris: any[] = [];

      await asyncForEach(vscode.workspace.workspaceFolders, async (folder: any) => {
        await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*.env*')).then(async (foundUris) => {
          foundUris
            .filter((u) => u.path.substring(u.path.lastIndexOf('/') + 1) !== '.env')
            .forEach((u) => {
              uris.push({
                ...u,
                folder,
              });
            });
        });
      });

      if (uris.length > 0) {
        const env = await vscode.window.showQuickPick(
          uris.map((uri) => {
            const label = `⚙️ ${uri.path.substring(uri.path.lastIndexOf('/') + 1)}`;
            const description = uri.path.substring(
              uri.path.indexOf(uri.folder.uri.path) + uri.folder.uri.path.length - uri.folder.name.length,
              uri.path.indexOf(uri.path.substring(uri.path.lastIndexOf('/') + 1))
            );
            return {
              label,
              description,
              path: uri.path,
            };
          }),
          {
            matchOnDescription: true,
          }
        );
        if (env) {
          const base = env.path.substring(0, env.path.lastIndexOf('/') + 1);
          await fs.unlinkSync(`${base}.env`);
          await fs.symlinkSync(env.path, `${base}.env`);
          vscode.window.showInformationMessage(`${env.label} in ${env.description} is selected!`);
        }
      } else {
        vscode.window.showInformationMessage(`There are no .env files!`);
      }
    } else {
      vscode.window.showInformationMessage(`There are no workspaces!`);
    }
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
