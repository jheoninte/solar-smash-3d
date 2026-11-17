Pod::Spec.new do |s|
  s.name = 'SolarSmashStoreKit'
  s.version = '0.1.0'
  s.summary = 'Local StoreKit 2 Capacitor plugin for Solar Smash 3D'
  s.license = { :type => 'MIT' }
  s.homepage = 'https://github.com/jheoninte/solar-smash-3d'
  s.author = 'Solar Smash 3D'
  s.source = { :git => 'https://github.com/jheoninte/solar-smash-3d.git', :tag => s.version.to_s }
  s.source_files = 'Sources/SolarSmashStoreKitPlugin/**/*.swift'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
