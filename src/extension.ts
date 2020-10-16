// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { window, Disposable, StatusBarAlignment, StatusBarItem, Command, Uri } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { type } from 'os';
const lnk = require('lnk')
const md5File = require('md5-file')

const OS_TYPE = type();
const WINDOWS_TYPE = 'Windows_NT'
const IS_ENABLED = vscode.workspace.getConfiguration('envSelector').get('enabled') as boolean;
const REGEX = vscode.workspace.getConfiguration('envSelector').get('regex') as string;
const ENV_NAME = '.env';

async function asyncForEach(array: readonly any[] | undefined, callback: Function) {
  if (array)
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

  if (!IS_ENABLED) {
    vscode.window.showErrorMessage(`🔀.ENV Selector is disabled!`);
    return;
  }

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand('envSelector.selectEnv', async () => {
    // The code you place here will be executed every time your command is executed

    if (vscode.workspace.workspaceFolders) {
      const uris: any[] = [];

      await asyncForEach(vscode.workspace.workspaceFolders, async (folder: any) => {
        await vscode.workspace.findFiles(new vscode.RelativePattern(folder, `**/${REGEX}`)).then(async (foundUris) => {
          foundUris
            .filter((u) => u.path.substring(u.path.lastIndexOf('/') + 1) !== ENV_NAME)
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
          try {
            let envPath = `${base}${ENV_NAME}`;
            if (OS_TYPE !== WINDOWS_TYPE) {
              await fs.unlinkSync(envPath);
            }
          } catch (error) { }

          if (OS_TYPE === WINDOWS_TYPE) {
            let winTarget = path.join(env.path);
            winTarget = winTarget.startsWith('\\') ? winTarget.substring(1) : winTarget;
            let winPath = path.join(`${base}`);
            winPath = winPath.startsWith('\\') ? winPath.substring(1) : winPath;

            try {
              lnk.sync(winTarget, winPath, { rename: ENV_NAME, force: true })
            } catch (error) { }
          } else {
            await fs.symlinkSync(env.path, `${base}${ENV_NAME}`);
          }
          vscode.window.showInformationMessage(`${env.label} in ${env.description} is selected!`);
        }
      } else {
        vscode.window.showInformationMessage(`There are no ${ENV_NAME} files!`);
      }
    } else {
      vscode.window.showInformationMessage(`There are no workspaces!`);
    }
  });

  // create a new env indicator
  let envIndicator = new EnvIndicator();
  let controller = new EnvIndicatorController(envIndicator);

  // Add to a list of disposables which are disposed when this extension is deactivated.
  context.subscriptions.push(controller);
  context.subscriptions.push(envIndicator);

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }

const getWinPath = (p: string): string => {
  const winPath = path.join(p);
  return winPath.startsWith('\\') ? winPath.substring(1) : winPath;
}
const getRealPath = async (envPath: string): Promise<string> => {
  let realPath = '';
  if (OS_TYPE === WINDOWS_TYPE) {
    const base = envPath.substring(0, envPath.lastIndexOf('/'));
    const envHash = await md5File.sync(getWinPath(envPath), { algorithm: 'md5' });

    const paths = await vscode.workspace.findFiles(new vscode.RelativePattern(base, `**/${REGEX}`)).then((foundUris) => {
      return foundUris
        .filter((u) => u.path.substring(u.path.lastIndexOf('/') + 1) !== ENV_NAME)
    });
    await asyncForEach(paths, async (u: any) => {
      const fileHash = await md5File.sync(getWinPath(u.path), { algorithm: 'md5' });
      if (envHash === fileHash) {
        realPath = u.path
      }
    })
  } else {
    realPath = await fs.realpathSync(envPath);
  }
  return realPath;
}

class EnvIndicator {
  private _statusBarItem!: StatusBarItem;

  public async updateEnvIndicator() {
    // Create as needed
    if (!this._statusBarItem) {
      this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
    }

    // Get the current text editor
    let editor = window.activeTextEditor;
    if (!editor) {
      this._statusBarItem.hide();
      return;
    }

    let doc = editor.document;
    let envPath = await this._getEnvIndicator(doc);
    if (envPath) {
      const realPath = await getRealPath(envPath);
      this._statusBarItem.text = `⚙️${realPath.substring(realPath.lastIndexOf('/') + 1)}`;
      const command: Command = {
        title: `Open ${ENV_NAME} file.`,
        command: 'vscode.open',
        arguments: [Uri.file(OS_TYPE === WINDOWS_TYPE ? getWinPath(realPath) : realPath)],
      };
      this._statusBarItem.command = command;
      this._statusBarItem.show();
    } else {
      this._statusBarItem.hide();
    }
  }

  public async getEnv(filePath: any): Promise<string> {
    let uris: any[] = [];
    await asyncForEach(vscode.workspace.workspaceFolders, async (folder: any) => {
      await vscode.workspace.findFiles(new vscode.RelativePattern(folder, `**/${ENV_NAME}`)).then((foundUris) => {
        foundUris.forEach((u) => {
          uris.push({
            ...u,
            folder,
          });
        });
      });
    });

    uris = uris.map((uri) => {
      return {
        ...uri,
        relativeCompare: path.relative(path.dirname(filePath), path.dirname(uri.path)),
      };
    });

    return uris.find((uri) => uri.relativeCompare.endsWith('..') || uri.relativeCompare === '')?.path;
  }

  public async _getEnvIndicator(doc: vscode.TextDocument): Promise<string> {
    const envPath = await this.getEnv(doc.uri.path);
    return envPath;
  }

  dispose() {
    this._statusBarItem.dispose();
  }
}

class EnvIndicatorController {
  private _envIndicator: EnvIndicator;
  private _disposable: Disposable;

  constructor(envIndicator: EnvIndicator) {
    this._envIndicator = envIndicator;
    this._envIndicator.updateEnvIndicator();

    // subscribe to selection change and editor activation events
    let subscriptions: Disposable[] = [];
    window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);

    // update the env indicator
    this._envIndicator.updateEnvIndicator();

    this._disposable = Disposable.from(...subscriptions);
  }

  dispose() {
    this._disposable.dispose();
  }

  private _onEvent() {
    this._envIndicator.updateEnvIndicator();
  }
}
