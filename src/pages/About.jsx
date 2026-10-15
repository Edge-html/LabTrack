import React from 'react';
import { Shield, Users, BookOpen, Heart } from 'lucide-react';
import labPics3 from '../assets/lab-pics3.png';

const LABTRACK_LOGO = '/images/labtrack_logo.png';

export default function About() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="card overflow-hidden">
        {/* Header with lab-pics3 photo and natural center gradient fade */}
        <div
          className="relative text-white p-8 sm:p-10 text-center overflow-hidden"
          style={{
            background: `linear-gradient(to bottom, rgba(110, 11, 16, 0.8), rgba(0, 0, 0, 0.7)), url(${labPics3}) center / cover no-repeat`,
            backgroundColor: '#1a1a1a',
          }}
        >
          <div className="relative z-10 flex flex-col items-center">
            {/* Logo in crisp circular badge */}
            <div className="relative mb-4">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-gold to-gold-light rounded-full blur-[2px] opacity-60"></div>
              <img
                src={LABTRACK_LOGO}
                alt="LabTrack logo"
                className="relative w-24 h-24 rounded-full object-contain bg-white p-1 shadow-lg ring-2 ring-gold/80"
                loading="lazy"
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">LabTrack</h1>
            <p className="text-cream text-sm mt-1 font-semibold tracking-wide">KNCHS SHS Laboratory System</p>
            <p className="text-gold italic text-sm mt-2.5 font-medium">Science today, solutions tomorrow.</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-gray-700 leading-relaxed">
            LabTrack is the official laboratory equipment management system for Koronadal National Comprehensive High School (KNCHS).
            It streamlines the process of tracking, borrowing, and returning science laboratory equipment.
          </p>

          {/* Feature tiles with pale gold/cream background and crimson icons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: Shield, title: 'Safe & Accountable', desc: 'Every borrow is tracked with full accountability and digital records.' },
              { icon: Users, title: 'Student-Centered', desc: 'Designed for students to easily request and track equipment.' },
              { icon: BookOpen, title: 'Policy-Driven', desc: 'Built around school policies with customizable rules and penalties.' },
              { icon: Heart, title: 'Better Science', desc: 'Helping students focus on experiments, not paperwork.' },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3 p-3.5 bg-gold-pale/60 border border-gold/30 rounded-xl">
                <f.icon size={20} className="text-crimson shrink-0 mt-0.5" strokeWidth={1.8} />
                <div>
                  <p className="text-sm font-bold text-ink">{f.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-4 text-center">
            <p className="text-xs text-gray-400">© {new Date().getFullYear()} KNCHS SHS Laboratory System. All rights reserved.</p>
            <p className="text-xs text-gray-400 mt-1">Built with React, Firebase, and Tailwind CSS.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
