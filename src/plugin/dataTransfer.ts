// Native dialogs avoid WKWebView's inconsistent download/file-input support.
// Encode replies because IINA interpolates messages into a JS template literal.
export function installDataTransfer(isClosed: () => boolean): void {
    iina.sidebar.onMessage("libraryTransfer", (request: { action?: string; text?: string; format?: string }) => {
        if(isClosed()) return;
        const reply=(value: unknown)=>{ if(!isClosed()) iina.sidebar.postMessage("libraryTransferResult", encodeURIComponent(JSON.stringify(value))); };
        try {
            if(request?.action === "import") {
                const path=iina.utils.chooseFile("Import YouTube backup or subscriptions", {allowedFileTypes:["json","csv"]});
                if(!path) { reply({cancelled:true}); return; }
                const text=iina.file.read(path);
                if(typeof text!=="string" || text.length>5_000_000) throw new Error("Choose a text backup smaller than 5 MB.");
                reply({text});
            } else if(request?.action === "export") {
                if(typeof request.text!=="string" || request.text.length>5_000_000) throw new Error("Backup is too large.");
                const folder=iina.utils.chooseFile("Choose a folder for your YouTube backup", {chooseDir:true});
                if(!folder) { reply({cancelled:true}); return; }
                const extension=request.format==='csv'?'csv':'json';
                const path=`${folder}/youtube-iina-${Date.now()}.${extension}`;
                iina.file.write(path,request.text);
                if(iina.file.read(path)!==request.text) throw new Error("Could not verify the saved backup.");
                iina.file.showInFinder(path);
                reply({saved:true});
            }
        } catch(error) { reply({error:error instanceof Error?error.message:"Data transfer failed."}); }
    });
}
