#[cfg(feature = "encode")]
pub mod encode;

#[cfg(feature = "stacktrace")]
pub use stacktrace::{
  stable_stacktrace_addrs, stable_stacktrace_addrs_if_no_debuginfo,
};

#[cfg(feature = "stacktrace")]
mod stacktrace {

  #[cfg(target_vendor = "apple")]
  fn stable_addr(addr: u64) -> Option<u64> {
    #![allow(deprecated)]
    use std::ffi::CStr;

    static TEXT: &CStr = c"__TEXT";
    let addr = addr.saturating_sub(1);
    let image_count = unsafe { libc::_dyld_image_count() };
    if image_count == 0 {
      return None;
    }
    let main_image = 0;
    let header = unsafe { libc::_dyld_get_image_header(main_image) };
    if header as usize as u64 >= addr || header.is_null() {
      return None;
    }
    let slide = unsafe { libc::_dyld_get_image_vmaddr_slide(main_image) };
    let mut offset = 0;
    let start =
      unsafe { header.cast::<u8>().add(size_of::<libc::mach_header_64>()) };
    let addr_stable = addr.saturating_sub(slide as u64);
    for _ in 0..unsafe { (*header).ncmds } {
      let hdr = unsafe { start.add(offset).cast::<libc::load_command>() };
      let cmd = unsafe { *hdr };
      if cmd.cmd == libc::LC_SEGMENT_64 {
        let data = hdr.cast::<libc::segment_command_64>();
        let segname = unsafe { (*data).segname };
        let segname =
          unsafe { std::mem::transmute::<[i8; 16], [u8; 16]>(segname) };

        if CStr::from_bytes_until_nul(&segname).unwrap() != TEXT {
          offset += cmd.cmdsize as usize;
          continue;
        }

        let segment_start = unsafe { (*data).vmaddr };
        let segment_end = segment_start + unsafe { (*data).vmsize };

        if addr_stable >= segment_start && addr_stable < segment_end {
          if main_image == 0 {
            let relative = addr_stable - segment_start;
            return Some(relative);
          }
        }
      }

      offset += cmd.cmdsize as usize;
    }
    None
  }

  #[cfg(all(not(target_vendor = "apple"), unix))]
  fn stable_addr(addr: u64) -> Option<u64> {
    use std::ffi::{c_int, c_void};
    let addr = addr.saturating_sub(1);

    struct Data {
      addr: u64,
      out: Option<u64>,
    }

    let mut data = Data { addr, out: None };

    unsafe extern "C" fn callback(
      info: *mut libc::dl_phdr_info,
      _size: usize,
      data: *mut c_void,
    ) -> c_int {
      let dlpi_addr = unsafe { *info }.dlpi_addr;
      let data = data.cast::<Data>();
      let addr = unsafe { (*data).addr };
      if addr < dlpi_addr {
        return 0;
      }
      let mut current = unsafe { (*info).dlpi_phdr };
      let end = current.add(unsafe { (*info).dlpi_phnum } as usize);
      while current < end {
        if unsafe { (*current).p_type != libc::PT_LOAD } {
          current = current.add(1);
          continue;
        }

        let segment_start = dlpi_addr.wrapping_add((*current).p_vaddr);
        let segment_end = segment_start + (*current).p_memsz;
        if addr >= segment_start && addr < segment_end {
          (*data).out = Some(addr.saturating_sub(dlpi_addr));
          return 1;
        }
        current = current.add(1);
      }
      0
    }
    unsafe { libc::dl_iterate_phdr(Some(callback), (&raw mut data).cast()) };

    data.out
  }

  #[cfg(windows)]
  fn stable_addr(addr: u64) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;

    use windows_sys::Win32::System::LibraryLoader::{
      GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GetModuleFileNameW,
      GetModuleHandleExW,
    };

    unsafe {
      let mut module = std::ptr::null_mut();
      if GetModuleHandleExW(
        GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
        addr as usize as *mut _,
        &mut module,
      ) == 0
      {
        return None;
      }

      let base = module as usize;

      let mut name_buf = [0u16; 512];
      let ret = GetModuleFileNameW(
        module,
        name_buf.as_mut_ptr(),
        name_buf.len() as u32,
      );
      if ret == 0 {
        return None;
      }
      let name_buf = &name_buf[..ret as usize];

      let exe_path = std::env::current_exe()
        .ok()?
        .as_os_str()
        .encode_wide()
        .collect::<Vec<u16>>();

      let address = addr - base as u64;

      if name_buf != exe_path {
        eprintln!("weird");
        return None;
      }

      Some(address)
    }
  }

  fn stable_stacktrace_addrs_maybe(
    only_if_no_debuginfo: bool,
  ) -> Option<Vec<Option<u64>>> {
    let mut addrs = Vec::new();
    let mut have_debuginfo = false;
    backtrace::trace(|frame| {
      backtrace::resolve_frame(frame, |f| {
        if f.addr().is_some() {
          have_debuginfo = true;
        }
      });
      if have_debuginfo {
        return false;
      }
      let ip = frame.ip() as usize as u64;
      let stable_addr = stable_addr(ip);
      addrs.push(stable_addr);
      true
    });

    if only_if_no_debuginfo && have_debuginfo {
      None
    } else {
      Some(addrs)
    }
  }

  pub fn stable_stacktrace_addrs_if_no_debuginfo() -> Option<Vec<Option<u64>>> {
    stable_stacktrace_addrs_maybe(true)
  }

  pub fn stable_stacktrace_addrs() -> Vec<Option<u64>> {
    stable_stacktrace_addrs_maybe(false).unwrap()
  }
}
