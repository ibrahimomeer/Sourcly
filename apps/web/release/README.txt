Sourcly
=======

Transparent, tunable academic source discovery. It runs entirely in your browser: there is no
Sourcly server, no account and no tracking. Your searches go straight from your browser to the
scholarly databases you choose (OpenAlex, Crossref, PubMed, Europe PMC, DOAJ, DataCite, Zenodo,
Wikipedia and Semantic Scholar).

Two ways to use this folder
---------------------------

1. Double-click index.html. It opens in your browser and works without a server.
   Keep config.js in the same folder as index.html.

2. Or serve the folder, which some people prefer. With Node.js installed, run this in the folder:

       npx serve

   and open the address it prints.

Changing the name, the library link or the footer
-------------------------------------------------

Everything you might want to change is in config.js, a plain text file you can open in any text
editor: the site name, the author name shown in the footer, the repository and download links,
the library sign-in prefix for the "Access with your library" button (empty hides it), and an
optional contact email for sources that ask for one. Save the file and reload the page. You do
not need to rebuild anything.

What is kept on your computer
-----------------------------

Only in this browser, and never sent anywhere: the list of sources you save, and (if you choose to
paste one in Settings) a personal OpenAlex API key. Results are not saved.

Labels and rankings are heuristics based on metadata. Verify sources before citing. How
everything is worked out is described in docs/methodology.md in the source repository (see the
"Methodology" link in the page header).

Licence: MIT (see LICENSE).
