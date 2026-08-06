"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import "./page.css";

// Helper components for icons
const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
  </svg>
);

const ArrowRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"></line>
    <polyline points="12 5 19 12 12 19"></polyline>
  </svg>
);

const CodeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6"></polyline>
    <polyline points="8 6 2 12 8 18"></polyline>
  </svg>
);

const BotIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"></rect>
    <circle cx="12" cy="5" r="2"></circle>
    <path d="M12 7v4"></path>
    <line x1="8" y1="16" x2="8" y2="16"></line>
    <line x1="16" y1="16" x2="16" y2="16"></line>
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const QrIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <rect x="7" y="7" width="3" height="3"></rect>
    <rect x="14" y="7" width="3" height="3"></rect>
    <rect x="7" y="14" width="3" height="3"></rect>
    <rect x="14" y="14" width="3" height="3"></rect>
  </svg>
);

const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"></line>
    <line x1="12" y1="20" x2="12" y2="4"></line>
    <line x1="6" y1="20" x2="6" y2="14"></line>
  </svg>
);

const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"></rect>
    <rect x="14" y="3" width="7" height="7"></rect>
    <rect x="14" y="14" width="7" height="7"></rect>
    <rect x="3" y="14" width="7" height="7"></rect>
  </svg>
);

const MonitorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
);

const DuckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a4 4 0 0 0-4 4c0 1.5 1 2.8 2 3.5V11a4 4 0 0 0-4 4v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1a4 4 0 0 0-4-4V9.5c1-.7 2-2 2-3.5a4 4 0 0 0-4-4Z"></path>
    <path d="M9 11v3"></path>
    <path d="M15 11v3"></path>
    <path d="M8.5 6a1.5 1.5 0 0 0-3 0"></path>
  </svg>
);

export default function LinkPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const links = [
    { title: "E-portfolio", desc: "My personal works and resume", url: "https://djuzee-website.vercel.app/", icon: <LinkIcon /> },
    { title: "Python Visualizer", desc: "Interactive python code execution", url: "/python", icon: <CodeIcon /> },
    { title: "Bot discord", desc: "Server management and automation", url: "https://discord.com/oauth2/authorize?client_id=1293199567503753307&permissions=8&integration_type=0&scope=bot", icon: <BotIcon /> },
    { title: "Schedule", desc: "Timetable and appointment tracking", url: "/Schedule", icon: <CalendarIcon /> },
    { title: "QR Code", desc: "Generate and manage quick links", url: "/qr", icon: <QrIcon /> },
    { title: "Foodwaste", desc: "The Past of Research for KKR-NCST", url: "/foodwaste", icon: <ChartIcon /> },
    { title: "drive parade", desc: "Wheel Spin", url: "https://drive.google.com/drive/folders/1HZUwuWTUFxcOfmRRYAF1lRl8AQNJVKUK?hl=th", icon: <GridIcon /> },

  ];

  if (!mounted) return null;

  return (
    <div className="page-wrapper">
      <main className="main-content">

        {/* Header Section */}
        <div className="section-header">
          <div className="title-group">
            <h1 className="main-title">djuzee</h1>
            <h3>Quick Access Hub</h3>
          </div>
          <span className="count-badge">
            <GridIcon />
            {links.length} Links
          </span>
        </div>

        {/* Cards Grid */}
        <div className="cards-grid">
          {links.map((link, i) => {
            const isInternal = link.url.startsWith("/");
            const CardWrapper = isInternal ? Link : "a";
            const wrapperProps = isInternal
              ? { href: link.url, prefetch: true }
              : { href: link.url, target: "_blank", rel: "noreferrer noopener" };

            return (
              <CardWrapper
                key={i}
                {...wrapperProps}
                className="project-card"
                style={{ "--delay": `${i * 0.05}s` }}
              >
                <div className="card-header">
                  <h4>{link.title}</h4>
                  <div className="icon-wrapper">
                    {link.icon || <LinkIcon />}
                  </div>
                </div>
                <p className="card-desc">{link.desc}</p>

                <div className="card-footer">
                  <span className="arrow-icon">
                    <ArrowRightIcon />
                  </span>
                </div>
              </CardWrapper>
            );
          })}
        </div>

      </main>
    </div>
  );
}