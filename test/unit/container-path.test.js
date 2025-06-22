/**
 * @module container-path.test
 * @description Tests for PATH environment variable handling in containers
 * 
 * Verifies that containers have proper PATH configuration to execute basic
 * shell commands during habitat build phases.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const { dockerExec } = require('../../src/container-operations');
const { spawn } = require('child_process');

describe('Container PATH Environment', () => {
  let spawnStub;
  
  beforeEach(() => {
    spawnStub = sinon.stub();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('dockerExec PATH handling', () => {
    it('should wrap commands to source habitat-env.sh before execution', async () => {
      // Mock spawn to capture the command
      const mockProcess = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        on: sinon.stub().callsFake((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        })
      };
      
      spawnStub = sinon.stub(require('child_process'), 'spawn').returns(mockProcess);
      
      await dockerExec('test-container', 'mkdir /test');
      
      expect(spawnStub.calledOnce).to.be.true;
      const [command, args] = spawnStub.firstCall.args;
      
      expect(command).to.equal('docker');
      expect(args).to.include('exec');
      expect(args).to.include('test-container');
      
      // Find the wrapped command
      const bashIndex = args.indexOf('-c');
      const wrappedCommand = args[bashIndex + 1];
      
      // Verify the command is wrapped to source habitat-env.sh
      expect(wrappedCommand).to.include('source /etc/profile.d/habitat-env.sh');
      expect(wrappedCommand).to.include('mkdir /test');
    });
  });

  describe('Habitat configuration PATH requirements', () => {
    it('should validate that habitats using non-standard base images define PATH', () => {
      const configs = [
        {
          name: 'ubuntu-based',
          baseImage: 'ubuntu:22.04',
          env: [],
          expectPathRequired: false  // Ubuntu has default PATH
        },
        {
          name: 'node-based',
          baseImage: 'node:20-bookworm',
          env: [],
          expectPathRequired: false  // Node images have default PATH
        },
        {
          name: 'discourse-dev',
          baseImage: 'discourse/discourse_dev:release',
          env: [],
          expectPathRequired: true  // Custom images may need PATH
        }
      ];

      configs.forEach(config => {
        const hasPath = config.env.some(envVar => 
          envVar.startsWith('PATH=') || envVar.includes('PATH=${PATH}')
        );
        
        if (config.expectPathRequired && !hasPath) {
          // This would fail for discourse config without PATH
          expect(hasPath).to.be.true;
        }
      });
    });
  });

  describe('PATH preservation in habitat-env.sh', () => {
    it('should include system PATH when setting custom PATH', () => {
      const envVars = [
        'PATH=${PATH}:/custom/bin',
        'USER=test'
      ];
      
      // Verify PATH includes ${PATH} placeholder for system PATH
      const pathVar = envVars.find(v => v.startsWith('PATH='));
      expect(pathVar).to.include('${PATH}');
    });
  });
});