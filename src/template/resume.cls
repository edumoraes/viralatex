\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{resume}[2026/03/09 Resume layout]

\LoadClass[10pt,a4paper]{article}

\RequirePackage[a4paper,margin=1.6cm]{geometry}
\RequirePackage{enumitem}
\RequirePackage{fontspec}
\RequirePackage[hidelinks]{hyperref}
\RequirePackage{tabularx}
\RequirePackage[table]{xcolor}

\setmainfont{Latin Modern Roman}
\setsansfont{Latin Modern Sans}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.35em}
\setlist[itemize]{leftmargin=1.2em,itemsep=0.2em,topsep=0.2em,parsep=0em,partopsep=0em}

\definecolor{ResumeAccent}{HTML}{1E3A5F}
\definecolor{ResumeMuted}{HTML}{5B6573}

\newcommand{\ResumeName}[1]{
  {\fontsize{24}{28}\selectfont\bfseries #1\par}
}

\newcommand{\ResumeRole}[1]{
  {\large\color{ResumeAccent}#1\par}
}

\newcommand{\ResumeContacts}[1]{
  {\small\color{ResumeMuted}#1\par}
}

\newcommand{\makeprofile}[3]{
  \ResumeName{#1}
  \ResumeRole{#2}
  \ResumeContacts{#3}
  \vspace{0.8em}
}

\newcommand{\resumesection}[1]{
  \vspace{0.9em}
  {\large\bfseries\color{ResumeAccent} #1\par}
  \vspace{0.25em}
  {\color{ResumeAccent}\rule{\linewidth}{0.6pt}\par}
  \vspace{0.4em}
}

\newcommand{\summaryblock}[1]{
  {\small #1\par}
}

\newcommand{\resumeentry}[4]{
  \textbf{#1} \hfill {\small #2}\par
  {\emph{#3}}\par
  {\small #4\par}
}

\newcommand{\projectentry}[3]{
  \textbf{#1} \hfill {\small #2}\par
  {\small #3\par}
}

\newcommand{\skillline}[2]{
  \textbf{#1}: #2\par
}

\newenvironment{highlights}{
  \begin{itemize}
}{
  \end{itemize}
}

\newcommand{\spacer}{
  \vspace{0.35em}
}

\endinput
