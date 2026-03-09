\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{resume}[2026/03/09 Resume layout]

\LoadClass[10pt,a4paper]{article}

\RequirePackage[a4paper,margin=1.7cm,top=1.45cm,bottom=1.55cm]{geometry}
\RequirePackage{array}
\RequirePackage{enumitem}
\RequirePackage[T1]{fontenc}
\RequirePackage[hidelinks]{hyperref}
\RequirePackage{lmodern}
\RequirePackage{microtype}
\RequirePackage{tabularx}
\RequirePackage{xcolor}

\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\setlength{\tabcolsep}{0pt}
\setlist[itemize]{
  leftmargin=1.05em,
  itemsep=0.05em,
  topsep=0.1em,
  parsep=0em,
  partopsep=0em,
  label=\textbullet
}

\definecolor{ResumeInk}{HTML}{3E3E3E}
\definecolor{ResumeRule}{HTML}{7A7A7A}
\color{ResumeInk}

\newlength{\ResumeSkillLabelWidth}
\setlength{\ResumeSkillLabelWidth}{3.45cm}
\newlength{\ResumeSummaryIndent}
\setlength{\ResumeSummaryIndent}{1.3em}
\newlength{\ResumeEntryIndent}
\setlength{\ResumeEntryIndent}{1.3em}

\newcommand{\ResumeName}[1]{
  {\centering\fontsize{22}{24}\selectfont\textsc{#1}\par}
}

\newcommand{\ResumeRole}[1]{
  {\centering\fontsize{9}{11}\selectfont #1\par}
}

\newcommand{\ResumeContacts}[1]{
  {\centering\fontsize{8.4}{10}\selectfont #1\par}
}

\newcommand{\makeprofile}[3]{
  \ResumeName{#1}
  \ResumeRole{#2}
  \ResumeContacts{#3}
  \vspace{0.65em}
}

\newcommand{\resumesection}[1]{
  \vspace{0.9em}
  {\fontsize{9.7}{9.9}\selectfont\textsc{#1}\par}
  \vspace{-0.28em}
  {\color{ResumeRule}\rule{\linewidth}{0.45pt}\par}
  \vspace{0.28em}
}

\newcommand{\summaryblock}[1]{
  {\fontsize{9}{11}\selectfont\leftskip=\ResumeSummaryIndent #1\par}
}

\newcommand{\resumeentry}[4]{
  \noindent\hspace*{\ResumeEntryIndent}%
  \parbox[t]{\dimexpr\linewidth-\ResumeEntryIndent\relax}{%
    \textbf{#1} \textbar\ \textbf{#3}\hfill {\fontsize{9}{10}\selectfont #2}\par
    {\fontsize{9}{10.5}\selectfont #4\par}%
  }%
  \par
}

\newcommand{\projectentry}[3]{
  \noindent\hspace*{\ResumeEntryIndent}%
  \parbox[t]{\dimexpr\linewidth-\ResumeEntryIndent\relax}{%
    \textbf{#1}\hfill {\fontsize{9}{10}\selectfont #2}\par
    {\fontsize{9}{10.5}\selectfont #3\par}%
  }%
  \par
}

\newcommand{\skillline}[2]{
  \noindent\hspace*{\ResumeEntryIndent}%
  \makebox[\dimexpr\ResumeSkillLabelWidth-\ResumeEntryIndent\relax][l]{\textbf{#1}:}%
  \hspace{0.35em}%
  \parbox[t]{\dimexpr\linewidth-\ResumeSkillLabelWidth-0.35em\relax}{\fontsize{9}{10.5}\selectfont #2}\par
}

\newcommand{\educationentry}[4]{
  \noindent\hspace*{\ResumeEntryIndent}%
  \parbox[t]{\dimexpr\linewidth-\ResumeEntryIndent\relax}{%
    \textbf{#1}\hfill #2\par
    #4\hfill {\fontsize{9}{10}\selectfont #3}\par
  }%
  \par
}

\newenvironment{highlights}{
  \begin{itemize}
}{
  \end{itemize}
}

\newcommand{\spacer}{
  \vspace{0.45em}
}

\endinput
