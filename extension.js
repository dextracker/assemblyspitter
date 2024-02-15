const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
    const disposable = vscode.commands.registerCommand('assemblyspitter.findAssembly', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        console.log('Workspace Root:', workspaceRoot);

        const outputPath = path.join(workspaceRoot, 'assembly_snippets.md');
        let markdownContent = '';

        let solidityFiles = [];

        const scopePath = findScopeFile(workspaceRoot);
        if (scopePath) {
            console.log(`.scope file found at: ${scopePath}`);
            const scopeContent = fs.readFileSync(scopePath, 'utf-8');
            console.log(`Contents of .scope file: ${scopeContent}`);
            const scopePaths = scopeContent.split('\n').map(line => line.trim()).filter(line => line !== '');
            for (const scopePath of scopePaths) {
                console.log(`Searching for Solidity files in: ${scopePath}`);
                let files = findFilesInSubfolder(scopePath, workspaceRoot);
                console.log("Files",files)
                console.log("path", scopePath)
                solidityFiles.push(...files);
                solidityFiles.push();
            }
        } else {
            console.log('.scope file not found. Proceeding with default behavior.');
            solidityFiles = await vscode.workspace.findFiles('**/*.sol');
        }

        console.log(`Found ${solidityFiles.length} Solidity files.`);

        if (solidityFiles.length === 0) {
            vscode.window.showInformationMessage('No Solidity files found.');
            return;
        }

        for (const file of solidityFiles) {
            const document = await vscode.workspace.openTextDocument(file);
            const assemblySnippets = await findAssemblyBlocks(document);
            console.log("assemblySnippets", assemblySnippets)
            if (assemblySnippets.length > 0) {
                const fileName = path.basename(file.path ? file.path : file);
                markdownContent += `## ${fileName}\n\n`;
                for (const snippet of assemblySnippets) {
                    markdownContent += '```solidity\n';
                    markdownContent += snippet + '\n';
                    markdownContent += '```\n\n';
                }
                    const fileContent = document.getText();
                    console.log(`Contents of ${fileName}:\n${fileContent}`);
            }
        }

        console.log(`Writing Markdown content to file: ${outputPath}`);

        fs.writeFileSync(outputPath, markdownContent, 'utf8');

        console.log(`Assembly snippets saved to ${outputPath}`);
        vscode.window.showInformationMessage(`Assembly snippets saved to ${outputPath}`);
    });

    context.subscriptions.push(disposable);

    console.log('Extension activated.');
}

async function findAssemblyBlocks(document) {
    const assemblySnippets = [];
    let isInsideAssemblyBlock = false;
    let nestedLevel = 0;
    let assemblyBlockLines = [];

    // Function to process and reset once a block is closed
    const processAssemblyBlock = () => {
        if (assemblyBlockLines.length > 0) {
            const snippet = assemblyBlockLines.join('\n'); // Join all lines to form the snippet
            assemblySnippets.push(snippet);
            assemblyBlockLines = []; // Reset for the next block
        }
    };

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;

        // Check if the line contains the start of an assembly block
        if (!isInsideAssemblyBlock && lineText.match(/\bassembly\s*{/)) {
            isInsideAssemblyBlock = true;
            nestedLevel = 1; // Reset nested level for a new block
            assemblyBlockLines.push(lineText); // Start capturing the assembly block
            continue;
        }

        if (isInsideAssemblyBlock) {
            assemblyBlockLines.push(lineText);

            // Count the opening and closing braces to manage nested blocks
            const openingBraces = (lineText.match(/{/g) || []).length;
            const closingBraces = (lineText.match(/}/g) || []).length;
            nestedLevel += openingBraces - closingBraces;

            // If we've matched all opening and closing braces, we've found the end of the block
            if (nestedLevel === 0) {
                processAssemblyBlock(); // Process and reset
                isInsideAssemblyBlock = false; // Exit assembly block mode
            }
        }
    }

    // In case the document ends while still inside an assembly block (which should not happen in well-formed code)
    if (isInsideAssemblyBlock) {
        processAssemblyBlock();
    }

    return assemblySnippets;
}


function findFilesInSubfolder(scopePath, subfolderPath) {
    console.log(`Exploring subfolder: ${subfolderPath}`);
    const files = [];
    const subfolderFiles = fs.readdirSync(subfolderPath);
    for (const file of subfolderFiles) {
        const filePath = path.join(subfolderPath, file);
        if (fs.lstatSync(filePath).isDirectory()) { // Recursively search subdirectories
            const subdirectoryFiles = findFilesInSubfolder(scopePath, filePath);
            files.push(...subdirectoryFiles);
        } else if (filePath.endsWith('.sol') && filePath.includes(scopePath)) { // Check if it's a Solidity file and matches the scopePath
            files.push(filePath);
        }
    }
    return files;
}

function findScopeFile(directory, depth = 0) {
    console.log(`Exploring directory: ${directory}`);
    const scopeFilePath = path.join(directory, '.scope');
    
    if (fs.existsSync(scopeFilePath)) {
        console.log(`.scope file found at: ${scopeFilePath}`);
        const scopeContent = fs.readFileSync(scopeFilePath, 'utf-8');
        console.log(`Contents of .scope file: ${scopeContent}`);
        return scopeFilePath;
    } else if (depth === 0) { // Only allow searching one level deeper
        const subdirectories = fs.readdirSync(directory);
        for (const subdir of subdirectories) {
            const fullPath = path.join(directory, subdir);
            if (fs.lstatSync(fullPath).isDirectory()) {
                // Increase depth because we're going one level deeper
                const result = findScopeFile(fullPath, depth + 1);
                if (result) {
                    return result;
                }
            }
        }
    }
    return null;
}

module.exports = {
    activate
};
