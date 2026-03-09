\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{resume}[2026/03/09 Resume layout]

\LoadClass[10pt,a4paper]{article}

\RequirePackage[a4paper,left=1.48cm,right=1.48cm,top=1.24cm,bottom=1.38cm]{geometry}
\RequirePackage{array}
\RequirePackage{enumitem}
\RequirePackage[T1]{fontenc}
\RequirePackage[hidelinks]{hyperref}
\RequirePackage{microtype}
\RequirePackage{tabularx}
\RequirePackage{xcolor}

\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\setlength{\tabcolsep}{0pt}
\renewcommand{\familydefault}{\rmdefault}
\setlist[itemize]{
  leftmargin=2.48em,
  labelsep=0.62em,
  itemsep=0em,
  topsep=0.02em,
  parsep=0em,
  partopsep=0em,
  label=\textbullet
}

\definecolor{ResumeInk}{HTML}{2F2F2F}
\definecolor{ResumeRule}{HTML}{6E6E6E}
\color{ResumeInk}

\newlength{\ResumeSkillLabelWidth}
\setlength{\ResumeSkillLabelWidth}{3.7cm}
\newlength{\ResumeSummaryIndent}
\setlength{\ResumeSummaryIndent}{1.48em}
\newlength{\ResumeEntryIndent}
\setlength{\ResumeEntryIndent}{1.48em}
\newlength{\ResumeDateColumnWidth}
\setlength{\ResumeDateColumnWidth}{3.05cm}

\newcommand{\ResumeName}[1]{
  {\centering\fontsize{24.5}{25.7}\selectfont\textsc{#1}\par}
}

\newcommand{\ResumeRole}[1]{
  {\centering\fontsize{10}{12.2}\selectfont #1\par}
}

\newcommand{\ResumeContacts}[1]{
  {\centering\fontsize{9}{11.2}\selectfont\lineskip=0.55em\lineskiplimit=0pt #1\par}
}

\newcommand{\makeprofile}[3]{
  \ResumeName{#1}
  \vspace{0.08em}
  \ResumeRole{#2}
  \vspace{0.14em}
  \ResumeContacts{#3}
  \vspace{0.82em}
}

\newcommand{\resumesection}[1]{
  \vspace{0.96em}
  {\fontsize{10}{10.25}\selectfont\textsc{#1}\par}
  \vspace{-0.22em}
  {\color{ResumeRule}\rule{\linewidth}{0.5pt}\par}
  \vspace{0.18em}
}

\newcommand{\summaryblock}[1]{
  {\fontsize{10}{11.95}\selectfont\leftskip=\ResumeSummaryIndent #1\par}
}

\newcommand{\resumeentry}[4]{
  \noindent\hspace*{\ResumeEntryIndent}%
  \parbox[t]{\dimexpr\linewidth-\ResumeEntryIndent\relax}{%
    {\fontsize{10}{10.8}\selectfont\textbf{#1} \textbar\ \textbf{#3}%
    \hfill\makebox[\ResumeDateColumnWidth][r]{#2}\par}%
    \vspace{0.12em}%
    {\fontsize{10}{11.8}\selectfont #4\par}%
  }%
  \par
}

\newcommand{\projectentry}[3]{
  \noindent\hspace*{\ResumeEntryIndent}%
  \parbox[t]{\dimexpr\linewidth-\ResumeEntryIndent\relax}{%
    {\fontsize{10}{10.8}\selectfont\textbf{#1}%
    \hfill\makebox[\ResumeDateColumnWidth][r]{#2}\par}%
    \vspace{0.12em}%
    {\fontsize{10}{11.8}\selectfont #3\par}%
  }%
  \par
}

\newcommand{\skillline}[2]{
  \noindent\hspace*{\ResumeEntryIndent}%
  \makebox[\dimexpr\ResumeSkillLabelWidth-\ResumeEntryIndent\relax][l]{\fontsize{10}{10.8}\selectfont\textbf{#1}:}%
  \hspace{0.4em}%
  \parbox[t]{\dimexpr\linewidth-\ResumeSkillLabelWidth-0.4em\relax}{\fontsize{10}{11.95}\selectfont #2}\par
}

\newcommand{\educationentry}[4]{
  \noindent\hspace*{\ResumeEntryIndent}%
  \parbox[t]{\dimexpr\linewidth-\ResumeEntryIndent\relax}{%
    {\fontsize{10}{10.8}\selectfont\textbf{#1}%
    \hfill\makebox[\ResumeDateColumnWidth][r]{#2}\par}%
    \vspace{0.1em}%
    {\fontsize{10}{11.3}\selectfont #4%
    \hfill\makebox[\ResumeDateColumnWidth][r]{#3}\par}%
  }%
  \par
}

\newenvironment{highlights}{
  \begin{itemize}
}{
  \end{itemize}
}

\newcommand{\spacer}{
  \vspace{0.72em}
}

\endinput
