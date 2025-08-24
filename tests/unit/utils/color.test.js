// Unit tests for color utility functions

import { test, expect, describe } from 'bun:test';
import {
  generateHighContrastHex,
  hslToHex,
  generateDeterministicColor
} from '../../../api/utils/color.js';

describe('color utilities', () => {
  describe('hslToHex', () => {
    test('should convert basic HSL colors to hex', () => {
      expect(hslToHex(0, 100, 50)).toBe('#ff0000'); // Red
      expect(hslToHex(120, 100, 50)).toBe('#00ff00'); // Green
      expect(hslToHex(240, 100, 50)).toBe('#0000ff'); // Blue
    });

    test('should convert white and black correctly', () => {
      expect(hslToHex(0, 0, 100)).toBe('#ffffff'); // White
      expect(hslToHex(0, 0, 0)).toBe('#000000'); // Black
    });

    test('should handle gray colors', () => {
      expect(hslToHex(0, 0, 50)).toBe('#808080'); // Gray
      expect(hslToHex(180, 0, 75)).toBe('#bfbfbf'); // Light gray
    });

    test('should handle edge cases for hue values', () => {
      expect(hslToHex(360, 100, 50)).toBe('#ff0000'); // 360 degrees = 0 degrees
      expect(hslToHex(0, 100, 50)).toBe('#ff0000'); // 0 degrees = red
    });

    test('should handle different saturation levels', () => {
      const red0 = hslToHex(0, 0, 50); // No saturation = gray
      const red50 = hslToHex(0, 50, 50); // Medium saturation
      const red100 = hslToHex(0, 100, 50); // Full saturation = pure red
      
      expect(red0).toBe('#808080');
      expect(red50).toBe('#bf4040');
      expect(red100).toBe('#ff0000');
    });

    test('should handle different lightness levels', () => {
      const dark = hslToHex(120, 100, 25); // Dark green
      const medium = hslToHex(120, 100, 50); // Medium green
      const light = hslToHex(120, 100, 75); // Light green
      
      expect(dark).toBe('#008000');
      expect(medium).toBe('#00ff00');
      expect(light).toBe('#80ff80');
    });

    test('should produce valid hex color format', () => {
      const hexPattern = /^#[0-9a-f]{6}$/i;
      
      // Test multiple random combinations
      for (let i = 0; i < 50; i++) {
        const h = Math.floor(Math.random() * 360);
        const s = Math.floor(Math.random() * 101);
        const l = Math.floor(Math.random() * 101);
        const hex = hslToHex(h, s, l);
        
        expect(hex).toMatch(hexPattern);
      }
    });

    test('should handle decimal inputs by rounding appropriately', () => {
      const result = hslToHex(120.7, 100.1, 49.9);
      expect(result).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe('generateHighContrastHex', () => {
    test('should generate valid hex colors', () => {
      const hexPattern = /^#[0-9a-f]{6}$/i;
      
      for (let i = 0; i < 100; i++) {
        const color = generateHighContrastHex();
        expect(color).toMatch(hexPattern);
      }
    });

    test('should generate different colors on multiple calls', () => {
      const colors = new Set();
      
      // Generate many colors to check for variety
      for (let i = 0; i < 50; i++) {
        colors.add(generateHighContrastHex());
      }
      
      // Should have generated at least some different colors
      expect(colors.size).toBeGreaterThan(10);
    });

    test('should generate high contrast colors suitable for dark backgrounds', () => {
      // Test by converting multiple generated colors back to check lightness
      for (let i = 0; i < 20; i++) {
        const hex = generateHighContrastHex();
        
        // Extract RGB values
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        
        // Calculate luminance (rough approximation)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
        
        // Should be reasonably bright for dark backgrounds
        expect(luminance).toBeGreaterThan(100); // Arbitrary threshold for "bright"
      }
    });

    test('should not generate black or very dark colors', () => {
      for (let i = 0; i < 50; i++) {
        const hex = generateHighContrastHex();
        
        // Should not be black or very close to black
        expect(hex).not.toBe('#000000');
        expect(hex).not.toMatch(/^#0[0-3][0-3][0-3][0-3][0-3]$/);
      }
    });
  });

  describe('generateDeterministicColor', () => {
    test('should generate consistent colors for same input', () => {
      const input = 'test-string';
      
      const color1 = generateDeterministicColor(input);
      const color2 = generateDeterministicColor(input);
      const color3 = generateDeterministicColor(input);
      
      expect(color1).toBe(color2);
      expect(color2).toBe(color3);
    });

    test('should generate different colors for different inputs', () => {
      const inputs = ['test1', 'test2', 'test3', 'different', 'unique'];
      const colors = inputs.map(input => generateDeterministicColor(input));
      
      // All colors should be unique
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(colors.length);
    });

    test('should generate valid hex colors', () => {
      const hexPattern = /^#[0-9a-f]{6}$/i;
      const inputs = ['short', 'medium-length', 'very-long-string-with-many-characters'];
      
      inputs.forEach(input => {
        const color = generateDeterministicColor(input);
        expect(color).toMatch(hexPattern);
      });
    });

    test('should handle empty string input', () => {
      const color = generateDeterministicColor('');
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    test('should handle special characters in input', () => {
      const inputs = [
        'test!@#$%^&*()',
        'unicode-αβγδε',
        'spaces in string',
        'numbers123456',
        'mixed-CASE-String'
      ];
      
      inputs.forEach(input => {
        const color = generateDeterministicColor(input);
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    test('should be case sensitive', () => {
      const color1 = generateDeterministicColor('Test');
      const color2 = generateDeterministicColor('test');
      const color3 = generateDeterministicColor('TEST');
      
      expect(color1).not.toBe(color2);
      expect(color2).not.toBe(color3);
      expect(color1).not.toBe(color3);
    });

    test('should generate high contrast colors like random version', () => {
      const inputs = ['job1', 'job2', 'job3', 'task-alpha', 'process-beta'];
      
      inputs.forEach(input => {
        const hex = generateDeterministicColor(input);
        
        // Extract RGB values
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        
        // Calculate luminance (rough approximation)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
        
        // Should be reasonably bright for dark backgrounds
        expect(luminance).toBeGreaterThan(100);
      });
    });

    test('should handle very long strings', () => {
      const longString = 'a'.repeat(1000);
      const color = generateDeterministicColor(longString);
      
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    test('should generate same color for job IDs with same base', () => {
      // This tests the consistency of the hash function
      const jobId1 = 'job_1642519200_abc123';
      const jobId2 = 'job_1642519200_abc123'; // Same ID
      
      const color1 = generateDeterministicColor(jobId1);
      const color2 = generateDeterministicColor(jobId2);
      
      expect(color1).toBe(color2);
    });

    test('should handle unicode characters correctly', () => {
      const unicodeInputs = [
        '测试字符串',
        'тест',
        'プロジェクト',
        'العربية',
        '🚀🎨💻'
      ];
      
      unicodeInputs.forEach(input => {
        const color = generateDeterministicColor(input);
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });
  });

  describe('integration tests', () => {
    test('all color generation functions should produce valid hex format', () => {
      const hexPattern = /^#[0-9a-f]{6}$/i;
      
      // Test random high contrast
      expect(generateHighContrastHex()).toMatch(hexPattern);
      
      // Test deterministic
      expect(generateDeterministicColor('test')).toMatch(hexPattern);
      
      // Test direct HSL conversion
      expect(hslToHex(180, 75, 60)).toMatch(hexPattern);
    });

    test('deterministic colors should remain consistent across multiple calls', () => {
      const testInputs = ['job1', 'task2', 'process3'];
      
      // Generate colors multiple times
      const firstPass = testInputs.map(input => generateDeterministicColor(input));
      const secondPass = testInputs.map(input => generateDeterministicColor(input));
      const thirdPass = testInputs.map(input => generateDeterministicColor(input));
      
      expect(firstPass).toEqual(secondPass);
      expect(secondPass).toEqual(thirdPass);
    });

    test('colors should be visually distinct enough for UI use', () => {
      const colors = [
        generateDeterministicColor('red-ish'),
        generateDeterministicColor('green-ish'),
        generateDeterministicColor('blue-ish'),
        generateDeterministicColor('purple-ish'),
        generateDeterministicColor('orange-ish')
      ];
      
      // All should be unique
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(colors.length);
      
      // All should be high contrast
      colors.forEach(hex => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
        
        expect(luminance).toBeGreaterThan(80); // Reasonable threshold
      });
    });
  });
});