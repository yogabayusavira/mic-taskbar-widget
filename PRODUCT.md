# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Windows users who need immediate confirmation that their microphone is receiving their voice, especially before or during a call.

## Product Purpose

A small always-visible taskbar widget that stays neutral in silence and turns green when the microphone detects speech.

## Positioning

It is a single-purpose live microphone signal indicator rather than a full recording or calling app.

## Operating Context

The widget starts with Windows after installation, docks at the bottom-right edge of the usable screen area above the taskbar, and requests microphone permission from the operating system.

## Capabilities and Constraints

- Monitors the selected system microphone through the browser media API.
- Lets the user choose and retain a specific input device when the Windows default differs from the microphone used in Discord.
- Shows a green active state only when the measured input clears a conservative speech-level threshold.
- Does not save, transmit, or record audio.
- Provides optional local mic monitoring (sidetone), muted by default to prevent accidental feedback.
- Uses Windows' work area to avoid covering the taskbar.

## Product Principles

- Be visible without being distracting.
- Communicate microphone state at a glance.
- Keep audio local and ephemeral.
- Recover plainly when permission or a device is unavailable.
