export interface RenderPass {
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
}

export function createFullscreenPipeline(
  device: GPUDevice,
  vertexShader: string,
  fragmentShader: string,
  bindGroupLayout: GPUBindGroupLayout,
  format: GPUTextureFormat,
): GPURenderPipeline {
  return device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: {
      module: device.createShaderModule({ code: vertexShader }),
      entryPoint: "vs",
    },
    fragment: {
      module: device.createShaderModule({ code: fragmentShader }),
      entryPoint: "fs",
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
  });
}

export function createTexture(device: GPUDevice, width: number, height: number, format: GPUTextureFormat): GPUTexture {
  return device.createTexture({
    size: { width, height },
    format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
  });
}

export function runPass(
  encoder: GPUCommandEncoder,
  pipeline: GPURenderPipeline,
  bindGroup: GPUBindGroup,
  target: GPUTextureView,
) {
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: target,
      loadOp: "clear",
      storeOp: "store",
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
}
