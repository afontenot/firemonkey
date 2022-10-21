# FireMonkey Source Code Repository

> The open-source model is a decentralized software development model
> that encourages open collaboration. A main principle of open-source
> software development is peer production, with products such as
> source code, blueprints, and documentation freely available to the
> public. ... Open-source code is meant to be a collaborative effort, 
> where programmers improve upon the source code and share the
> changes within the community.
>
> — [Wikipedia](https://en.wikipedia.org/w/index.php?title=Open_source&oldid=1115992361)

[FireMonkey](https://addons.mozilla.org/en-US/firefox/addon/firemonkey)
is an add-on for the Firefox web browser that manages user scripts.
In that regard it's much like Greasemonkey, except that it uses a
newer API (the userScripts API) that Firefox built for the purpose.
The result is, ideally, more efficient and more secure user scripts.

Unfortunately, FireMonkey is developed under what I call a
"semi-closed" approach. While the code is technically released under
an open-source license, and not minified or obfuscated, the
development practice and changes are entirely hidden. There is no
easy mechanism for a user to submit a pull request, and the
community has no input into the ongoing development.

This repository is an attempt to change that. I have extracted the
complete version history for the add-on, which is preserved on the
main branch.

The goal is to recreate, insofar as is possible, precise commits
containing individual changes as recorded in the changelogs. This 
will happen on a different branch.

I will also maintain a feature branch with changes of my own. Pull
requests and issues are also welcome.
