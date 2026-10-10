import React from 'react';
import { FlaskConical, Shield, Users, BookOpen, Heart } from 'lucide-react';

export default function About() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 text-white p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <FlaskConical size={32} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-bold">LabTrack</h1>
          <p className="text-blue-100 text-sm mt-1">KNCHS Science Laboratory Equipment Inventory & Borrowing System</p>
          <p className="text-blue-200 italic text-sm mt-3">Science today, solutions tomorrow.</p>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            LabTrack is the official laboratory equipment management system for Kapatagan National Comprehensive High School (KNCHS).
            It streamlines the process of tracking, borrowing, and returning science laboratory equipment.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: Shield, title: 'Safe & Accountable', desc: 'Every borrow is tracked with full accountability and digital records.' },
              { icon: Users, title: 'Student-Centered', desc: 'Designed for students to easily request and track equipment.' },
              { icon: BookOpen, title: 'Policy-Driven', desc: 'Built around school policies with customizable rules and penalties.' },
              { icon: Heart, title: 'Better Science', desc: 'Helping students focus on experiments, not paperwork.' },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-primary-50 rounded-xl">
                <f.icon size={18} className="text-primary-500 shrink-0 mt-0.5" strokeWidth={1.8} />
                <div>
                  <p className="text-sm font-semibold text-gray-800">{f.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-4 text-center">
            <p className="text-xs text-gray-400">© {new Date().getFullYear()} KNCHS Laboratory System. All rights reserved.</p>
            <p className="text-xs text-gray-400 mt-1">Built with React, Firebase, and Tailwind CSS.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
