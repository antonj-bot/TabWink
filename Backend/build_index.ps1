param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'documents.json')
)

$ErrorActionPreference = 'Stop'
$oneNote = New-Object -ComObject OneNote.Application
$namespace = 'http://schemas.microsoft.com/office/onenote/2013/onenote'
$documents = [System.Collections.Generic.List[object]]::new()

Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'data') -Filter '*.one' -File | ForEach-Object {
    $sectionId = ''
    $oneNote.OpenHierarchy($_.FullName, '', [ref]$sectionId, 0)

    $hierarchy = ''
    $oneNote.GetHierarchy($sectionId, 4, [ref]$hierarchy)
    [xml]$sectionXml = $hierarchy
    $namespaceManager = New-Object System.Xml.XmlNamespaceManager($sectionXml.NameTable)
    $namespaceManager.AddNamespace('one', $namespace)
    $pages = $sectionXml.SelectNodes('//one:Page', $namespaceManager)

    $pageNumber = 0
    foreach ($pageNode in $pages) {
        $pageNumber++
        $pageContent = ''
        $oneNote.GetPageContent($pageNode.GetAttribute('ID'), [ref]$pageContent, 0)
        [xml]$pageXml = $pageContent
        $pageNamespaceManager = New-Object System.Xml.XmlNamespaceManager($pageXml.NameTable)
        $pageNamespaceManager.AddNamespace('one', $namespace)

        $paragraphs = foreach ($textNode in $pageXml.SelectNodes('//one:T', $pageNamespaceManager)) {
            $text = $textNode.InnerText -replace '<br\s*/?>', "`n"
            $text = [System.Net.WebUtility]::HtmlDecode($text)
            $text = $text -replace '<[^>]+>', ''
            $text = $text -replace '[\u00A0\u200B\uFEFF]', ' '
            $text = $text.Trim()
            if ($text) { $text }
        }
        $text = ($paragraphs -join "`n") -replace '[ \t]+', ' '
        $text = $text -replace ' *\n *', "`n"

        if ($text) {
            $documents.Add([pscustomobject]@{
                file = $_.Name
                page = $pageNumber
                page_title = $pageNode.GetAttribute('name')
                text = $text
            })
        }
    }
}

if ($documents.Count -eq 0) {
    throw 'No readable OneNote pages were found in Backend/data.'
}

$destination = [System.IO.Path]::GetFullPath($OutputPath)
$json = ConvertTo-Json -InputObject @($documents) -Depth 5
[System.IO.File]::WriteAllText($destination, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output "Indexed $($documents.Count) OneNote pages into $destination"