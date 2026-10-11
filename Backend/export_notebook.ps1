# Settings
$notebookName = "TQA Manual.url"   # exact notebook name in OneNote
$outDir = "$PSScriptRoot\data"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# 1. Connect to the OneNote desktop app
$onenote = New-Object -ComObject OneNote.Application

# 2. Get the list of notebooks and sections (as XML)
$hierarchy = ""
$onenote.GetHierarchy("", 3, [ref]$hierarchy)   # 3 = include sections
[xml]$xml = $hierarchy
$ns = New-Object Xml.XmlNamespaceManager($xml.NameTable)
$ns.AddNamespace("one", $xml.DocumentElement.NamespaceURI)

# 3. Find the notebook
$notebook = $xml.SelectSingleNode("//one:Notebook[@name='$notebookName']", $ns)
if (-not $notebook) {
    Write-Host "Notebook '$notebookName' not found. Is it open in OneNote?"
    exit
}

# 4. Export every section (including ones inside section groups)
foreach ($section in $notebook.SelectNodes(".//one:Section", $ns)) {
    if ($section.isInRecycleBin -eq "true") { continue }

    $safeName = $section.name -replace '[\\/:*?"<>|]', '_'
    $path = Join-Path $outDir "$safeName.docx"

    if (Test-Path $path) { Remove-Item $path }   # Publish fails if the file exists

    $onenote.Publish($section.ID, $path, 5, "")  # 5 = Word format
    Write-Host "Exported: $safeName.docx"
}