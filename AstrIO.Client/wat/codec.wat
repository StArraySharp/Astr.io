(module
  (type (;0;) (func (param i32 i32) (result i32)))
  (type (;1;) (func (result i32)))
  (type (;2;) (func (param i32) (result i32)))
  (type (;3;) (func (param i32 i32 i32 i32)))
  (type (;4;) (func (param i32)))
  (type (;5;) (func (param i32 i32 i32) (result i32)))
  (type (;6;) (func (param i32 i32 i32 i32 i32 i32 i32 i32)))
  (func (;0;) (type 0) (param i32 i32) (result i32)
    (local i32 i32 i32 i32)
    local.get 0
    local.tee 2
    i32.const 3
    i32.add
    i32.const 7
    i32.and
    local.set 4
    local.get 0
    i32.const 5
    i32.add
    i32.const 7
    i32.and
    local.set 5
    local.get 1
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 0
                        i32.const 7
                        i32.and
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.tee 0
    local.get 2
    i32.const 15
    i32.and
    local.tee 1
    i32.shl
    local.get 0
    i32.const 32
    local.get 1
    i32.sub
    i32.shr_u
    i32.or
    i32.xor
    local.set 0
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 4
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.get 0
    i32.xor
    local.tee 0
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 5
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.get 0
    i32.const 11
    i32.shr_u
    i32.xor
    i32.add
    local.tee 0
    i32.const 16
    i32.shr_u
    local.get 0
    i32.xor
    i32.const 73244475
    i32.mul
    local.tee 0
    local.get 0
    i32.const 13
    i32.shr_u
    i32.xor
    local.set 0
    block  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  local.get 2
                                                                  br_table 0 (;@31;) 1 (;@30;) 2 (;@29;) 3 (;@28;) 4 (;@27;) 5 (;@26;) 6 (;@25;) 7 (;@24;) 8 (;@23;) 9 (;@22;) 10 (;@21;) 11 (;@20;) 12 (;@19;) 13 (;@18;) 14 (;@17;) 15 (;@16;) 16 (;@15;) 17 (;@14;) 18 (;@13;) 19 (;@12;) 20 (;@11;) 21 (;@10;) 22 (;@9;) 23 (;@8;) 24 (;@7;) 25 (;@6;) 26 (;@5;) 27 (;@4;) 28 (;@3;) 29 (;@2;) 30 (;@1;)
                                                                end
                                                                local.get 0
                                                                i32.const 1597463007
                                                                i32.xor
                                                                i32.const -2048144789
                                                                i32.mul
                                                                local.tee 0
                                                                i32.const 13
                                                                i32.shr_u
                                                                local.get 0
                                                                i32.xor
                                                                local.set 0
                                                                block (result i32)  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    local.get 2
                                                                                    i32.const 2
                                                                                    i32.xor
                                                                                    i32.const 7
                                                                                    i32.and
                                                                                    br_table 0 (;@40;) 1 (;@39;) 2 (;@38;) 3 (;@37;) 4 (;@36;) 5 (;@35;) 6 (;@34;) 7 (;@33;) 8 (;@32;)
                                                                                  end
                                                                                  global.get 8
                                                                                  br 8 (;@31;)
                                                                                end
                                                                                global.get 9
                                                                                br 7 (;@31;)
                                                                              end
                                                                              global.get 10
                                                                              br 6 (;@31;)
                                                                            end
                                                                            global.get 11
                                                                            br 5 (;@31;)
                                                                          end
                                                                          global.get 12
                                                                          br 4 (;@31;)
                                                                        end
                                                                        global.get 13
                                                                        br 3 (;@31;)
                                                                      end
                                                                      global.get 14
                                                                      br 2 (;@31;)
                                                                    end
                                                                    global.get 15
                                                                    br 1 (;@31;)
                                                                  end
                                                                  i32.const 0
                                                                end
                                                                local.get 0
                                                                i32.add
                                                                i32.const -1028477387
                                                                i32.mul
                                                                local.tee 0
                                                                i32.const 16
                                                                i32.shr_u
                                                                local.get 0
                                                                i32.xor
                                                                return
                                                              end
                                                              local.get 0
                                                              local.get 0
                                                              i32.const 16
                                                              i32.shr_u
                                                              i32.xor
                                                              i32.const 73244475
                                                              i32.mul
                                                              local.tee 0
                                                              i32.const 16
                                                              i32.shr_u
                                                              local.get 0
                                                              i32.xor
                                                              i32.const 73244475
                                                              i32.mul
                                                              local.set 0
                                                              block (result i32)  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  local.get 2
                                                                                  i32.const 5
                                                                                  i32.xor
                                                                                  i32.const 7
                                                                                  i32.and
                                                                                  br_table 0 (;@39;) 1 (;@38;) 2 (;@37;) 3 (;@36;) 4 (;@35;) 5 (;@34;) 6 (;@33;) 7 (;@32;) 8 (;@31;)
                                                                                end
                                                                                global.get 8
                                                                                br 8 (;@30;)
                                                                              end
                                                                              global.get 9
                                                                              br 7 (;@30;)
                                                                            end
                                                                            global.get 10
                                                                            br 6 (;@30;)
                                                                          end
                                                                          global.get 11
                                                                          br 5 (;@30;)
                                                                        end
                                                                        global.get 12
                                                                        br 4 (;@30;)
                                                                      end
                                                                      global.get 13
                                                                      br 3 (;@30;)
                                                                    end
                                                                    global.get 14
                                                                    br 2 (;@30;)
                                                                  end
                                                                  global.get 15
                                                                  br 1 (;@30;)
                                                                end
                                                                i32.const 0
                                                              end
                                                              local.get 0
                                                              i32.xor
                                                              local.tee 0
                                                              i32.const 16
                                                              i32.shr_u
                                                              local.get 0
                                                              i32.xor
                                                              return
                                                            end
                                                            block (result i32)  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                local.get 2
                                                                                i32.const 1
                                                                                i32.xor
                                                                                i32.const 7
                                                                                i32.and
                                                                                br_table 0 (;@38;) 1 (;@37;) 2 (;@36;) 3 (;@35;) 4 (;@34;) 5 (;@33;) 6 (;@32;) 7 (;@31;) 8 (;@30;)
                                                                              end
                                                                              global.get 8
                                                                              br 8 (;@29;)
                                                                            end
                                                                            global.get 9
                                                                            br 7 (;@29;)
                                                                          end
                                                                          global.get 10
                                                                          br 6 (;@29;)
                                                                        end
                                                                        global.get 11
                                                                        br 5 (;@29;)
                                                                      end
                                                                      global.get 12
                                                                      br 4 (;@29;)
                                                                    end
                                                                    global.get 13
                                                                    br 3 (;@29;)
                                                                  end
                                                                  global.get 14
                                                                  br 2 (;@29;)
                                                                end
                                                                global.get 15
                                                                br 1 (;@29;)
                                                              end
                                                              i32.const 0
                                                            end
                                                            local.get 0
                                                            i32.xor
                                                            local.tee 1
                                                            i32.const 7
                                                            i32.shl
                                                            local.get 1
                                                            i32.const 25
                                                            i32.shr_u
                                                            i32.or
                                                            i32.const -559038737
                                                            i32.xor
                                                            i32.const 1540483477
                                                            i32.mul
                                                            local.tee 1
                                                            i32.const 15
                                                            i32.shr_u
                                                            local.get 1
                                                            i32.xor
                                                            local.get 0
                                                            i32.const 3
                                                            i32.shr_u
                                                            i32.add
                                                            return
                                                          end
                                                          local.get 0
                                                          i32.const 16
                                                          i32.shr_u
                                                          local.tee 1
                                                          i32.const 40503
                                                          i32.mul
                                                          local.get 0
                                                          i32.const 65535
                                                          i32.and
                                                          i32.add
                                                          i32.const 65535
                                                          i32.and
                                                          local.tee 0
                                                          i32.const 24375
                                                          i32.mul
                                                          local.get 1
                                                          i32.xor
                                                          i32.const 65535
                                                          i32.and
                                                          local.tee 1
                                                          i32.const 45742
                                                          i32.mul
                                                          local.get 0
                                                          i32.add
                                                          i32.const 65535
                                                          i32.and
                                                          local.get 1
                                                          i32.const 16
                                                          i32.shl
                                                          i32.or
                                                          local.set 0
                                                          block (result i32)  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              local.get 2
                                                                              i32.const 3
                                                                              i32.xor
                                                                              i32.const 7
                                                                              i32.and
                                                                              br_table 0 (;@37;) 1 (;@36;) 2 (;@35;) 3 (;@34;) 4 (;@33;) 5 (;@32;) 6 (;@31;) 7 (;@30;) 8 (;@29;)
                                                                            end
                                                                            global.get 8
                                                                            br 8 (;@28;)
                                                                          end
                                                                          global.get 9
                                                                          br 7 (;@28;)
                                                                        end
                                                                        global.get 10
                                                                        br 6 (;@28;)
                                                                      end
                                                                      global.get 11
                                                                      br 5 (;@28;)
                                                                    end
                                                                    global.get 12
                                                                    br 4 (;@28;)
                                                                  end
                                                                  global.get 13
                                                                  br 3 (;@28;)
                                                                end
                                                                global.get 14
                                                                br 2 (;@28;)
                                                              end
                                                              global.get 15
                                                              br 1 (;@28;)
                                                            end
                                                            i32.const 0
                                                          end
                                                          local.get 0
                                                          i32.xor
                                                          return
                                                        end
                                                        loop  ;; label = @27
                                                          local.get 3
                                                          i32.const 3
                                                          i32.lt_u
                                                          if  ;; label = @28
                                                            block (result i32)  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                local.get 2
                                                                                local.get 3
                                                                                i32.add
                                                                                i32.const 7
                                                                                i32.and
                                                                                br_table 0 (;@38;) 1 (;@37;) 2 (;@36;) 3 (;@35;) 4 (;@34;) 5 (;@33;) 6 (;@32;) 7 (;@31;) 8 (;@30;)
                                                                              end
                                                                              global.get 8
                                                                              br 8 (;@29;)
                                                                            end
                                                                            global.get 9
                                                                            br 7 (;@29;)
                                                                          end
                                                                          global.get 10
                                                                          br 6 (;@29;)
                                                                        end
                                                                        global.get 11
                                                                        br 5 (;@29;)
                                                                      end
                                                                      global.get 12
                                                                      br 4 (;@29;)
                                                                    end
                                                                    global.get 13
                                                                    br 3 (;@29;)
                                                                  end
                                                                  global.get 14
                                                                  br 2 (;@29;)
                                                                end
                                                                global.get 15
                                                                br 1 (;@29;)
                                                              end
                                                              i32.const 0
                                                            end
                                                            local.get 0
                                                            i32.xor
                                                            i32.const 461845907
                                                            i32.mul
                                                            local.tee 0
                                                            i32.const 13
                                                            i32.shl
                                                            local.get 0
                                                            i32.const 19
                                                            i32.shr_u
                                                            i32.or
                                                            i32.const 5
                                                            i32.mul
                                                            i32.const 430675100
                                                            i32.sub
                                                            local.set 0
                                                            local.get 3
                                                            i32.const 1
                                                            i32.add
                                                            local.set 3
                                                            br 1 (;@27;)
                                                          end
                                                        end
                                                        local.get 0
                                                        return
                                                      end
                                                      local.get 0
                                                      i32.const -889275714
                                                      i32.xor
                                                      local.tee 0
                                                      i32.const 13
                                                      i32.shl
                                                      local.get 0
                                                      i32.xor
                                                      local.tee 0
                                                      i32.const 17
                                                      i32.shr_u
                                                      local.get 0
                                                      i32.xor
                                                      local.tee 0
                                                      i32.const 5
                                                      i32.shl
                                                      local.get 0
                                                      i32.xor
                                                      local.set 0
                                                      block (result i32)  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          local.get 2
                                                                          i32.const 6
                                                                          i32.xor
                                                                          i32.const 7
                                                                          i32.and
                                                                          br_table 0 (;@35;) 1 (;@34;) 2 (;@33;) 3 (;@32;) 4 (;@31;) 5 (;@30;) 6 (;@29;) 7 (;@28;) 8 (;@27;)
                                                                        end
                                                                        global.get 8
                                                                        br 8 (;@26;)
                                                                      end
                                                                      global.get 9
                                                                      br 7 (;@26;)
                                                                    end
                                                                    global.get 10
                                                                    br 6 (;@26;)
                                                                  end
                                                                  global.get 11
                                                                  br 5 (;@26;)
                                                                end
                                                                global.get 12
                                                                br 4 (;@26;)
                                                              end
                                                              global.get 13
                                                              br 3 (;@26;)
                                                            end
                                                            global.get 14
                                                            br 2 (;@26;)
                                                          end
                                                          global.get 15
                                                          br 1 (;@26;)
                                                        end
                                                        i32.const 0
                                                      end
                                                      local.get 0
                                                      i32.add
                                                      local.tee 0
                                                      i32.const 11
                                                      i32.shr_u
                                                      local.get 0
                                                      i32.xor
                                                      i32.const 668265263
                                                      i32.mul
                                                      return
                                                    end
                                                    local.get 0
                                                    i32.const 255
                                                    i32.and
                                                    i32.const -2128831035
                                                    i32.xor
                                                    i32.const 16777619
                                                    i32.mul
                                                    local.get 0
                                                    i32.const 8
                                                    i32.shr_u
                                                    i32.const 255
                                                    i32.and
                                                    i32.xor
                                                    i32.const 16777619
                                                    i32.mul
                                                    local.get 0
                                                    i32.const 16
                                                    i32.shr_u
                                                    i32.const 255
                                                    i32.and
                                                    i32.xor
                                                    i32.const 16777619
                                                    i32.mul
                                                    local.get 0
                                                    i32.const 24
                                                    i32.shr_u
                                                    i32.xor
                                                    i32.const 16777619
                                                    i32.mul
                                                    local.set 0
                                                    block (result i32)  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        local.get 2
                                                                        i32.const 4
                                                                        i32.xor
                                                                        i32.const 7
                                                                        i32.and
                                                                        br_table 0 (;@34;) 1 (;@33;) 2 (;@32;) 3 (;@31;) 4 (;@30;) 5 (;@29;) 6 (;@28;) 7 (;@27;) 8 (;@26;)
                                                                      end
                                                                      global.get 8
                                                                      br 8 (;@25;)
                                                                    end
                                                                    global.get 9
                                                                    br 7 (;@25;)
                                                                  end
                                                                  global.get 10
                                                                  br 6 (;@25;)
                                                                end
                                                                global.get 11
                                                                br 5 (;@25;)
                                                              end
                                                              global.get 12
                                                              br 4 (;@25;)
                                                            end
                                                            global.get 13
                                                            br 3 (;@25;)
                                                          end
                                                          global.get 14
                                                          br 2 (;@25;)
                                                        end
                                                        global.get 15
                                                        br 1 (;@25;)
                                                      end
                                                      i32.const 0
                                                    end
                                                    local.get 0
                                                    i32.xor
                                                    return
                                                  end
                                                  local.get 0
                                                  i32.const 1
                                                  i32.shr_u
                                                  i32.const 1431655765
                                                  i32.and
                                                  local.get 0
                                                  i32.const 1431655765
                                                  i32.and
                                                  i32.const 1
                                                  i32.shl
                                                  i32.or
                                                  local.tee 0
                                                  i32.const 2
                                                  i32.shr_u
                                                  i32.const 858993459
                                                  i32.and
                                                  local.get 0
                                                  i32.const 858993459
                                                  i32.and
                                                  i32.const 2
                                                  i32.shl
                                                  i32.or
                                                  local.set 0
                                                  block (result i32)  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      local.get 2
                                                                      i32.const 7
                                                                      i32.xor
                                                                      i32.const 7
                                                                      i32.and
                                                                      br_table 0 (;@33;) 1 (;@32;) 2 (;@31;) 3 (;@30;) 4 (;@29;) 5 (;@28;) 6 (;@27;) 7 (;@26;) 8 (;@25;)
                                                                    end
                                                                    global.get 8
                                                                    br 8 (;@24;)
                                                                  end
                                                                  global.get 9
                                                                  br 7 (;@24;)
                                                                end
                                                                global.get 10
                                                                br 6 (;@24;)
                                                              end
                                                              global.get 11
                                                              br 5 (;@24;)
                                                            end
                                                            global.get 12
                                                            br 4 (;@24;)
                                                          end
                                                          global.get 13
                                                          br 3 (;@24;)
                                                        end
                                                        global.get 14
                                                        br 2 (;@24;)
                                                      end
                                                      global.get 15
                                                      br 1 (;@24;)
                                                    end
                                                    i32.const 0
                                                  end
                                                  local.get 0
                                                  i32.xor
                                                  i32.const 73244475
                                                  i32.mul
                                                  local.tee 0
                                                  i32.const 16
                                                  i32.shr_u
                                                  local.get 0
                                                  i32.xor
                                                  return
                                                end
                                                local.get 0
                                                i32.const 1515870811
                                                i32.sub
                                                local.tee 0
                                                i32.const 11
                                                i32.shl
                                                local.get 0
                                                i32.const 21
                                                i32.shr_u
                                                i32.or
                                                local.set 0
                                                block (result i32)  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    local.get 2
                                                                    i32.const 2
                                                                    i32.xor
                                                                    i32.const 7
                                                                    i32.and
                                                                    br_table 0 (;@32;) 1 (;@31;) 2 (;@30;) 3 (;@29;) 4 (;@28;) 5 (;@27;) 6 (;@26;) 7 (;@25;) 8 (;@24;)
                                                                  end
                                                                  global.get 8
                                                                  br 8 (;@23;)
                                                                end
                                                                global.get 9
                                                                br 7 (;@23;)
                                                              end
                                                              global.get 10
                                                              br 6 (;@23;)
                                                            end
                                                            global.get 11
                                                            br 5 (;@23;)
                                                          end
                                                          global.get 12
                                                          br 4 (;@23;)
                                                        end
                                                        global.get 13
                                                        br 3 (;@23;)
                                                      end
                                                      global.get 14
                                                      br 2 (;@23;)
                                                    end
                                                    global.get 15
                                                    br 1 (;@23;)
                                                  end
                                                  i32.const 0
                                                end
                                                local.get 0
                                                i32.add
                                                local.tee 0
                                                i32.const 8
                                                i32.shr_u
                                                local.get 0
                                                i32.xor
                                                i32.const 1812433253
                                                i32.mul
                                                local.tee 0
                                                i32.const 3
                                                i32.shl
                                                local.get 0
                                                i32.const 15
                                                i32.shr_u
                                                i32.xor
                                                local.get 0
                                                i32.xor
                                                return
                                              end
                                              local.get 0
                                              i32.const 305419896
                                              i32.xor
                                              local.set 0
                                              loop  ;; label = @22
                                                local.get 3
                                                i32.const 4
                                                i32.lt_u
                                                if  ;; label = @23
                                                  block (result i32)  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      local.get 3
                                                                      i32.const 7
                                                                      i32.and
                                                                      br_table 0 (;@33;) 1 (;@32;) 2 (;@31;) 3 (;@30;) 4 (;@29;) 5 (;@28;) 6 (;@27;) 7 (;@26;) 8 (;@25;)
                                                                    end
                                                                    global.get 8
                                                                    br 8 (;@24;)
                                                                  end
                                                                  global.get 9
                                                                  br 7 (;@24;)
                                                                end
                                                                global.get 10
                                                                br 6 (;@24;)
                                                              end
                                                              global.get 11
                                                              br 5 (;@24;)
                                                            end
                                                            global.get 12
                                                            br 4 (;@24;)
                                                          end
                                                          global.get 13
                                                          br 3 (;@24;)
                                                        end
                                                        global.get 14
                                                        br 2 (;@24;)
                                                      end
                                                      global.get 15
                                                      br 1 (;@24;)
                                                    end
                                                    i32.const 0
                                                  end
                                                  local.get 0
                                                  i32.add
                                                  local.tee 0
                                                  local.get 3
                                                  i32.const 7
                                                  i32.add
                                                  i32.shl
                                                  local.get 0
                                                  i32.xor
                                                  i32.const -1640531527
                                                  i32.mul
                                                  local.tee 0
                                                  i32.const 11
                                                  i32.shr_u
                                                  local.get 0
                                                  i32.xor
                                                  local.set 0
                                                  local.get 3
                                                  i32.const 1
                                                  i32.add
                                                  local.set 3
                                                  br 1 (;@22;)
                                                end
                                              end
                                              local.get 0
                                              return
                                            end
                                            local.get 0
                                            i32.const 1640531527
                                            i32.sub
                                            local.tee 0
                                            i32.const 15
                                            i32.shr_u
                                            local.get 0
                                            i32.xor
                                            i32.const -1084733587
                                            i32.mul
                                            local.tee 0
                                            i32.const 13
                                            i32.shr_u
                                            local.get 0
                                            i32.xor
                                            i32.const -1798288965
                                            i32.mul
                                            local.tee 0
                                            i32.const 16
                                            i32.shr_u
                                            local.get 0
                                            i32.xor
                                            local.set 0
                                            block (result i32)  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                local.get 2
                                                                i32.const 1
                                                                i32.xor
                                                                i32.const 7
                                                                i32.and
                                                                br_table 0 (;@30;) 1 (;@29;) 2 (;@28;) 3 (;@27;) 4 (;@26;) 5 (;@25;) 6 (;@24;) 7 (;@23;) 8 (;@22;)
                                                              end
                                                              global.get 8
                                                              br 8 (;@21;)
                                                            end
                                                            global.get 9
                                                            br 7 (;@21;)
                                                          end
                                                          global.get 10
                                                          br 6 (;@21;)
                                                        end
                                                        global.get 11
                                                        br 5 (;@21;)
                                                      end
                                                      global.get 12
                                                      br 4 (;@21;)
                                                    end
                                                    global.get 13
                                                    br 3 (;@21;)
                                                  end
                                                  global.get 14
                                                  br 2 (;@21;)
                                                end
                                                global.get 15
                                                br 1 (;@21;)
                                              end
                                              i32.const 0
                                            end
                                            local.get 0
                                            i32.add
                                            return
                                          end
                                          local.get 0
                                          block (result i32)  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              local.get 2
                                                              i32.const 3
                                                              i32.xor
                                                              i32.const 7
                                                              i32.and
                                                              br_table 0 (;@29;) 1 (;@28;) 2 (;@27;) 3 (;@26;) 4 (;@25;) 5 (;@24;) 6 (;@23;) 7 (;@22;) 8 (;@21;)
                                                            end
                                                            global.get 8
                                                            br 8 (;@20;)
                                                          end
                                                          global.get 9
                                                          br 7 (;@20;)
                                                        end
                                                        global.get 10
                                                        br 6 (;@20;)
                                                      end
                                                      global.get 11
                                                      br 5 (;@20;)
                                                    end
                                                    global.get 12
                                                    br 4 (;@20;)
                                                  end
                                                  global.get 13
                                                  br 3 (;@20;)
                                                end
                                                global.get 14
                                                br 2 (;@20;)
                                              end
                                              global.get 15
                                              br 1 (;@20;)
                                            end
                                            i32.const 0
                                          end
                                          i32.const 17958194
                                          i32.sub
                                          i32.xor
                                          i32.const -2048144789
                                          i32.mul
                                          local.tee 0
                                          i32.const 13
                                          i32.shr_u
                                          local.get 0
                                          i32.xor
                                          i32.const -1028477387
                                          i32.mul
                                          local.tee 0
                                          i32.const 16
                                          i32.shr_u
                                          local.get 0
                                          i32.xor
                                          return
                                        end
                                        local.get 0
                                        i32.const 9
                                        i32.shl
                                        local.get 0
                                        i32.const 23
                                        i32.shr_u
                                        i32.or
                                        local.set 0
                                        block (result i32)  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            local.get 2
                                                            i32.const 5
                                                            i32.xor
                                                            i32.const 7
                                                            i32.and
                                                            br_table 0 (;@28;) 1 (;@27;) 2 (;@26;) 3 (;@25;) 4 (;@24;) 5 (;@23;) 6 (;@22;) 7 (;@21;) 8 (;@20;)
                                                          end
                                                          global.get 8
                                                          br 8 (;@19;)
                                                        end
                                                        global.get 9
                                                        br 7 (;@19;)
                                                      end
                                                      global.get 10
                                                      br 6 (;@19;)
                                                    end
                                                    global.get 11
                                                    br 5 (;@19;)
                                                  end
                                                  global.get 12
                                                  br 4 (;@19;)
                                                end
                                                global.get 13
                                                br 3 (;@19;)
                                              end
                                              global.get 14
                                              br 2 (;@19;)
                                            end
                                            global.get 15
                                            br 1 (;@19;)
                                          end
                                          i32.const 0
                                        end
                                        local.get 0
                                        i32.xor
                                        i32.const 2127912214
                                        i32.add
                                        i32.const 461845907
                                        i32.mul
                                        local.tee 0
                                        i32.const 12
                                        i32.shr_u
                                        local.get 0
                                        i32.xor
                                        i32.const -1028477387
                                        i32.mul
                                        return
                                      end
                                      local.get 0
                                      i32.const -1
                                      i32.xor
                                      local.set 1
                                      block (result i32)  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          local.get 2
                                                          i32.const 6
                                                          i32.xor
                                                          i32.const 7
                                                          i32.and
                                                          br_table 0 (;@27;) 1 (;@26;) 2 (;@25;) 3 (;@24;) 4 (;@23;) 5 (;@22;) 6 (;@21;) 7 (;@20;) 8 (;@19;)
                                                        end
                                                        global.get 8
                                                        br 8 (;@18;)
                                                      end
                                                      global.get 9
                                                      br 7 (;@18;)
                                                    end
                                                    global.get 10
                                                    br 6 (;@18;)
                                                  end
                                                  global.get 11
                                                  br 5 (;@18;)
                                                end
                                                global.get 12
                                                br 4 (;@18;)
                                              end
                                              global.get 13
                                              br 3 (;@18;)
                                            end
                                            global.get 14
                                            br 2 (;@18;)
                                          end
                                          global.get 15
                                          br 1 (;@18;)
                                        end
                                        i32.const 0
                                      end
                                      local.set 0
                                      loop  ;; label = @18
                                        local.get 3
                                        i32.const 3
                                        i32.lt_u
                                        if  ;; label = @19
                                          local.get 1
                                          local.get 0
                                          local.get 3
                                          i32.const 3
                                          i32.shl
                                          i32.shr_u
                                          i32.const 255
                                          i32.and
                                          i32.xor
                                          i32.const 517762881
                                          i32.mul
                                          local.tee 1
                                          i32.const 7
                                          i32.shr_u
                                          local.get 1
                                          i32.xor
                                          local.set 1
                                          local.get 3
                                          i32.const 1
                                          i32.add
                                          local.set 3
                                          br 1 (;@18;)
                                        end
                                      end
                                      local.get 1
                                      i32.const -1
                                      i32.xor
                                      return
                                    end
                                    block (result i32)  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        local.get 2
                                                        i32.const 7
                                                        i32.and
                                                        br_table 0 (;@26;) 1 (;@25;) 2 (;@24;) 3 (;@23;) 4 (;@22;) 5 (;@21;) 6 (;@20;) 7 (;@19;) 8 (;@18;)
                                                      end
                                                      global.get 8
                                                      br 8 (;@17;)
                                                    end
                                                    global.get 9
                                                    br 7 (;@17;)
                                                  end
                                                  global.get 10
                                                  br 6 (;@17;)
                                                end
                                                global.get 11
                                                br 5 (;@17;)
                                              end
                                              global.get 12
                                              br 4 (;@17;)
                                            end
                                            global.get 13
                                            br 3 (;@17;)
                                          end
                                          global.get 14
                                          br 2 (;@17;)
                                        end
                                        global.get 15
                                        br 1 (;@17;)
                                      end
                                      i32.const 0
                                    end
                                    local.get 0
                                    i32.add
                                    i32.const 73244475
                                    i32.mul
                                    local.set 0
                                    block (result i32)  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        local.get 2
                                                        i32.const 4
                                                        i32.add
                                                        i32.const 7
                                                        i32.and
                                                        br_table 0 (;@26;) 1 (;@25;) 2 (;@24;) 3 (;@23;) 4 (;@22;) 5 (;@21;) 6 (;@20;) 7 (;@19;) 8 (;@18;)
                                                      end
                                                      global.get 8
                                                      br 8 (;@17;)
                                                    end
                                                    global.get 9
                                                    br 7 (;@17;)
                                                  end
                                                  global.get 10
                                                  br 6 (;@17;)
                                                end
                                                global.get 11
                                                br 5 (;@17;)
                                              end
                                              global.get 12
                                              br 4 (;@17;)
                                            end
                                            global.get 13
                                            br 3 (;@17;)
                                          end
                                          global.get 14
                                          br 2 (;@17;)
                                        end
                                        global.get 15
                                        br 1 (;@17;)
                                      end
                                      i32.const 0
                                    end
                                    local.get 0
                                    i32.xor
                                    local.tee 0
                                    i32.const 17
                                    i32.shl
                                    local.get 0
                                    i32.const 15
                                    i32.shr_u
                                    i32.or
                                    i32.const 461845907
                                    i32.mul
                                    local.tee 0
                                    i32.const 13
                                    i32.shr_u
                                    local.get 0
                                    i32.xor
                                    return
                                  end
                                  local.get 0
                                  i32.const 16
                                  i32.shr_u
                                  i32.const 255
                                  i32.and
                                  local.get 0
                                  i32.const 8
                                  i32.shr_u
                                  i32.const 255
                                  i32.and
                                  block (result i32)  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      local.get 2
                                                      i32.const 2
                                                      i32.xor
                                                      i32.const 7
                                                      i32.and
                                                      br_table 0 (;@25;) 1 (;@24;) 2 (;@23;) 3 (;@22;) 4 (;@21;) 5 (;@20;) 6 (;@19;) 7 (;@18;) 8 (;@17;)
                                                    end
                                                    global.get 8
                                                    br 8 (;@16;)
                                                  end
                                                  global.get 9
                                                  br 7 (;@16;)
                                                end
                                                global.get 10
                                                br 6 (;@16;)
                                              end
                                              global.get 11
                                              br 5 (;@16;)
                                            end
                                            global.get 12
                                            br 4 (;@16;)
                                          end
                                          global.get 13
                                          br 3 (;@16;)
                                        end
                                        global.get 14
                                        br 2 (;@16;)
                                      end
                                      global.get 15
                                      br 1 (;@16;)
                                    end
                                    i32.const 0
                                  end
                                  local.get 0
                                  i32.const 255
                                  i32.and
                                  i32.add
                                  local.tee 1
                                  i32.const 10
                                  i32.shl
                                  local.get 1
                                  i32.add
                                  local.tee 1
                                  i32.const 6
                                  i32.shr_u
                                  local.get 1
                                  i32.xor
                                  i32.add
                                  local.tee 1
                                  i32.const 10
                                  i32.shl
                                  local.get 1
                                  i32.add
                                  local.tee 1
                                  i32.const 6
                                  i32.shr_u
                                  local.get 1
                                  i32.xor
                                  i32.add
                                  local.tee 1
                                  i32.const 10
                                  i32.shl
                                  local.get 1
                                  i32.add
                                  local.tee 1
                                  i32.const 6
                                  i32.shr_u
                                  local.get 1
                                  i32.xor
                                  local.get 0
                                  i32.const 24
                                  i32.shr_u
                                  i32.add
                                  local.tee 0
                                  i32.const 10
                                  i32.shl
                                  local.get 0
                                  i32.add
                                  local.tee 0
                                  i32.const 6
                                  i32.shr_u
                                  local.get 0
                                  i32.xor
                                  local.tee 0
                                  i32.const 3
                                  i32.shl
                                  local.get 0
                                  i32.add
                                  local.tee 0
                                  i32.const 11
                                  i32.shr_u
                                  local.get 0
                                  i32.xor
                                  local.tee 0
                                  i32.const 15
                                  i32.shl
                                  local.get 0
                                  i32.add
                                  return
                                end
                                block (result i32)  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    local.get 2
                                                    i32.const 7
                                                    i32.xor
                                                    i32.const 7
                                                    i32.and
                                                    br_table 0 (;@24;) 1 (;@23;) 2 (;@22;) 3 (;@21;) 4 (;@20;) 5 (;@19;) 6 (;@18;) 7 (;@17;) 8 (;@16;)
                                                  end
                                                  global.get 8
                                                  br 8 (;@15;)
                                                end
                                                global.get 9
                                                br 7 (;@15;)
                                              end
                                              global.get 10
                                              br 6 (;@15;)
                                            end
                                            global.get 11
                                            br 5 (;@15;)
                                          end
                                          global.get 12
                                          br 4 (;@15;)
                                        end
                                        global.get 13
                                        br 3 (;@15;)
                                      end
                                      global.get 14
                                      br 2 (;@15;)
                                    end
                                    global.get 15
                                    br 1 (;@15;)
                                  end
                                  i32.const 0
                                end
                                local.get 0
                                i32.xor
                                i32.const -862048943
                                i32.mul
                                local.tee 1
                                i32.const 15
                                i32.shl
                                local.get 1
                                i32.const 17
                                i32.shr_u
                                i32.or
                                i32.const 461845907
                                i32.mul
                                local.get 0
                                i32.xor
                                local.tee 0
                                i32.const 13
                                i32.shl
                                local.get 0
                                i32.const 19
                                i32.shr_u
                                i32.or
                                i32.const 5
                                i32.mul
                                i32.const 430675100
                                i32.sub
                                return
                              end
                              block (result i32)  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  local.get 2
                                                  i32.const 3
                                                  i32.xor
                                                  i32.const 7
                                                  i32.and
                                                  br_table 0 (;@23;) 1 (;@22;) 2 (;@21;) 3 (;@20;) 4 (;@19;) 5 (;@18;) 6 (;@17;) 7 (;@16;) 8 (;@15;)
                                                end
                                                global.get 8
                                                br 8 (;@14;)
                                              end
                                              global.get 9
                                              br 7 (;@14;)
                                            end
                                            global.get 10
                                            br 6 (;@14;)
                                          end
                                          global.get 11
                                          br 5 (;@14;)
                                        end
                                        global.get 12
                                        br 4 (;@14;)
                                      end
                                      global.get 13
                                      br 3 (;@14;)
                                    end
                                    global.get 14
                                    br 2 (;@14;)
                                  end
                                  global.get 15
                                  br 1 (;@14;)
                                end
                                i32.const 0
                              end
                              local.set 1
                              loop  ;; label = @14
                                local.get 3
                                i32.const 3
                                i32.lt_u
                                if  ;; label = @15
                                  local.get 0
                                  local.get 1
                                  i32.add
                                  i32.const -1640531527
                                  i32.mul
                                  local.set 2
                                  local.get 1
                                  local.set 0
                                  local.get 2
                                  local.get 2
                                  i32.const 11
                                  i32.shr_u
                                  i32.xor
                                  local.set 1
                                  local.get 3
                                  i32.const 1
                                  i32.add
                                  local.set 3
                                  br 1 (;@14;)
                                end
                              end
                              local.get 1
                              return
                            end
                            local.get 0
                            i32.const 16
                            i32.shl
                            local.get 0
                            i32.const 16
                            i32.shr_u
                            i32.or
                            i32.const 73244475
                            i32.mul
                            local.set 0
                            block (result i32)  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                local.get 2
                                                i32.const 4
                                                i32.xor
                                                i32.const 7
                                                i32.and
                                                br_table 0 (;@22;) 1 (;@21;) 2 (;@20;) 3 (;@19;) 4 (;@18;) 5 (;@17;) 6 (;@16;) 7 (;@15;) 8 (;@14;)
                                              end
                                              global.get 8
                                              br 8 (;@13;)
                                            end
                                            global.get 9
                                            br 7 (;@13;)
                                          end
                                          global.get 10
                                          br 6 (;@13;)
                                        end
                                        global.get 11
                                        br 5 (;@13;)
                                      end
                                      global.get 12
                                      br 4 (;@13;)
                                    end
                                    global.get 13
                                    br 3 (;@13;)
                                  end
                                  global.get 14
                                  br 2 (;@13;)
                                end
                                global.get 15
                                br 1 (;@13;)
                              end
                              i32.const 0
                            end
                            local.get 0
                            i32.xor
                            local.tee 0
                            i32.const 13
                            i32.shr_u
                            local.get 0
                            i32.xor
                            i32.const -2048144789
                            i32.mul
                            local.tee 0
                            i32.const 16
                            i32.shr_u
                            local.get 0
                            i32.xor
                            return
                          end
                          global.get 14
                          global.get 11
                          local.get 0
                          global.get 8
                          i32.const -1163005939
                          i32.xor
                          i32.xor
                          i32.const 1540483477
                          i32.mul
                          i32.xor
                          local.tee 0
                          i32.const 15
                          i32.shr_u
                          local.get 0
                          i32.xor
                          i32.add
                          i32.const -1028477387
                          i32.mul
                          local.tee 0
                          i32.const 13
                          i32.shr_u
                          local.get 0
                          i32.xor
                          return
                        end
                        local.get 0
                        i32.const 322420958
                        i32.xor
                        local.tee 1
                        i32.const 5
                        i32.shl
                        local.get 1
                        i32.const 27
                        i32.shr_u
                        i32.or
                        local.set 1
                        block (result i32)  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            local.get 2
                                            i32.const 1
                                            i32.xor
                                            i32.const 7
                                            i32.and
                                            br_table 0 (;@20;) 1 (;@19;) 2 (;@18;) 3 (;@17;) 4 (;@16;) 5 (;@15;) 6 (;@14;) 7 (;@13;) 8 (;@12;)
                                          end
                                          global.get 8
                                          br 8 (;@11;)
                                        end
                                        global.get 9
                                        br 7 (;@11;)
                                      end
                                      global.get 10
                                      br 6 (;@11;)
                                    end
                                    global.get 11
                                    br 5 (;@11;)
                                  end
                                  global.get 12
                                  br 4 (;@11;)
                                end
                                global.get 13
                                br 3 (;@11;)
                              end
                              global.get 14
                              br 2 (;@11;)
                            end
                            global.get 15
                            br 1 (;@11;)
                          end
                          i32.const 0
                        end
                        local.get 1
                        i32.add
                        i32.const 668265263
                        i32.mul
                        local.tee 1
                        i32.const 11
                        i32.shl
                        local.get 1
                        i32.const 21
                        i32.shr_u
                        i32.or
                        local.get 0
                        i32.const 7
                        i32.shr_u
                        i32.xor
                        i32.const 1540483477
                        i32.mul
                        return
                      end
                      local.get 0
                      local.set 1
                      loop  ;; label = @10
                        local.get 3
                        i32.const 2
                        i32.lt_u
                        if  ;; label = @11
                          block (result i32)  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              local.get 2
                                              local.get 3
                                              i32.const 3
                                              i32.mul
                                              i32.add
                                              i32.const 7
                                              i32.and
                                              br_table 0 (;@21;) 1 (;@20;) 2 (;@19;) 3 (;@18;) 4 (;@17;) 5 (;@16;) 6 (;@15;) 7 (;@14;) 8 (;@13;)
                                            end
                                            global.get 8
                                            br 8 (;@12;)
                                          end
                                          global.get 9
                                          br 7 (;@12;)
                                        end
                                        global.get 10
                                        br 6 (;@12;)
                                      end
                                      global.get 11
                                      br 5 (;@12;)
                                    end
                                    global.get 12
                                    br 4 (;@12;)
                                  end
                                  global.get 13
                                  br 3 (;@12;)
                                end
                                global.get 14
                                br 2 (;@12;)
                              end
                              global.get 15
                              br 1 (;@12;)
                            end
                            i32.const 0
                          end
                          local.tee 0
                          i32.const 15
                          i32.and
                          i32.const 1
                          i32.add
                          local.set 4
                          local.get 0
                          local.get 1
                          i32.xor
                          local.tee 0
                          local.get 4
                          i32.shl
                          local.get 0
                          i32.const 32
                          local.get 4
                          i32.sub
                          i32.shr_u
                          i32.or
                          i32.const -2048144789
                          i32.mul
                          local.set 1
                          local.get 3
                          i32.const 1
                          i32.add
                          local.set 3
                          br 1 (;@10;)
                        end
                      end
                      local.get 1
                      local.get 1
                      i32.const 16
                      i32.shr_u
                      i32.xor
                      return
                    end
                    local.get 0
                    block (result i32)  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        local.get 2
                                        i32.const 2
                                        i32.xor
                                        i32.const 7
                                        i32.and
                                        br_table 0 (;@18;) 1 (;@17;) 2 (;@16;) 3 (;@15;) 4 (;@14;) 5 (;@13;) 6 (;@12;) 7 (;@11;) 8 (;@10;)
                                      end
                                      global.get 8
                                      br 8 (;@9;)
                                    end
                                    global.get 9
                                    br 7 (;@9;)
                                  end
                                  global.get 10
                                  br 6 (;@9;)
                                end
                                global.get 11
                                br 5 (;@9;)
                              end
                              global.get 12
                              br 4 (;@9;)
                            end
                            global.get 13
                            br 3 (;@9;)
                          end
                          global.get 14
                          br 2 (;@9;)
                        end
                        global.get 15
                        br 1 (;@9;)
                      end
                      i32.const 0
                    end
                    i32.sub
                    i32.const -862048943
                    i32.mul
                    local.tee 0
                    i32.const 15
                    i32.shr_u
                    local.get 0
                    i32.xor
                    i32.const 559038737
                    i32.add
                    i32.const 461845907
                    i32.mul
                    local.tee 0
                    i32.const 13
                    i32.shr_u
                    local.get 0
                    i32.xor
                    return
                  end
                  local.get 0
                  i32.const 73244475
                  i32.mul
                  local.set 0
                  block (result i32)  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      local.get 2
                                      i32.const 5
                                      i32.xor
                                      i32.const 7
                                      i32.and
                                      br_table 0 (;@17;) 1 (;@16;) 2 (;@15;) 3 (;@14;) 4 (;@13;) 5 (;@12;) 6 (;@11;) 7 (;@10;) 8 (;@9;)
                                    end
                                    global.get 8
                                    br 8 (;@8;)
                                  end
                                  global.get 9
                                  br 7 (;@8;)
                                end
                                global.get 10
                                br 6 (;@8;)
                              end
                              global.get 11
                              br 5 (;@8;)
                            end
                            global.get 12
                            br 4 (;@8;)
                          end
                          global.get 13
                          br 3 (;@8;)
                        end
                        global.get 14
                        br 2 (;@8;)
                      end
                      global.get 15
                      br 1 (;@8;)
                    end
                    i32.const 0
                  end
                  local.get 0
                  i32.xor
                  i32.const -2048144789
                  i32.mul
                  local.set 0
                  block (result i32)  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      local.get 2
                                      i32.const 2
                                      i32.xor
                                      i32.const 7
                                      i32.and
                                      br_table 0 (;@17;) 1 (;@16;) 2 (;@15;) 3 (;@14;) 4 (;@13;) 5 (;@12;) 6 (;@11;) 7 (;@10;) 8 (;@9;)
                                    end
                                    global.get 8
                                    br 8 (;@8;)
                                  end
                                  global.get 9
                                  br 7 (;@8;)
                                end
                                global.get 10
                                br 6 (;@8;)
                              end
                              global.get 11
                              br 5 (;@8;)
                            end
                            global.get 12
                            br 4 (;@8;)
                          end
                          global.get 13
                          br 3 (;@8;)
                        end
                        global.get 14
                        br 2 (;@8;)
                      end
                      global.get 15
                      br 1 (;@8;)
                    end
                    i32.const 0
                  end
                  local.get 0
                  i32.xor
                  i32.const -1028477387
                  i32.mul
                  local.tee 0
                  i32.const 16
                  i32.shr_u
                  local.get 0
                  i32.xor
                  return
                end
                block (result i32)  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    local.get 2
                                    i32.const 6
                                    i32.xor
                                    i32.const 7
                                    i32.and
                                    br_table 0 (;@16;) 1 (;@15;) 2 (;@14;) 3 (;@13;) 4 (;@12;) 5 (;@11;) 6 (;@10;) 7 (;@9;) 8 (;@8;)
                                  end
                                  global.get 8
                                  br 8 (;@7;)
                                end
                                global.get 9
                                br 7 (;@7;)
                              end
                              global.get 10
                              br 6 (;@7;)
                            end
                            global.get 11
                            br 5 (;@7;)
                          end
                          global.get 12
                          br 4 (;@7;)
                        end
                        global.get 13
                        br 3 (;@7;)
                      end
                      global.get 14
                      br 2 (;@7;)
                    end
                    global.get 15
                    br 1 (;@7;)
                  end
                  i32.const 0
                end
                local.get 0
                i32.add
                local.set 0
                loop  ;; label = @7
                  local.get 3
                  i32.const 3
                  i32.lt_u
                  if  ;; label = @8
                    local.get 0
                    local.get 0
                    i32.const 7
                    i32.shl
                    i32.xor
                    i32.const 556226971
                    i32.mul
                    local.tee 0
                    i32.const 9
                    i32.shr_u
                    local.get 0
                    i32.xor
                    local.set 0
                    local.get 3
                    i32.const 1
                    i32.add
                    local.set 3
                    br 1 (;@7;)
                  end
                end
                block (result i32)  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    local.get 2
                                    i32.const 1
                                    i32.xor
                                    i32.const 7
                                    i32.and
                                    br_table 0 (;@16;) 1 (;@15;) 2 (;@14;) 3 (;@13;) 4 (;@12;) 5 (;@11;) 6 (;@10;) 7 (;@9;) 8 (;@8;)
                                  end
                                  global.get 8
                                  br 8 (;@7;)
                                end
                                global.get 9
                                br 7 (;@7;)
                              end
                              global.get 10
                              br 6 (;@7;)
                            end
                            global.get 11
                            br 5 (;@7;)
                          end
                          global.get 12
                          br 4 (;@7;)
                        end
                        global.get 13
                        br 3 (;@7;)
                      end
                      global.get 14
                      br 2 (;@7;)
                    end
                    global.get 15
                    br 1 (;@7;)
                  end
                  i32.const 0
                end
                local.get 0
                i32.xor
                return
              end
              global.get 10
              global.get 11
              i32.add
              local.get 0
              global.get 8
              global.get 9
              i32.add
              i32.xor
              i32.const -1640531527
              i32.mul
              i32.xor
              local.tee 0
              i32.const 11
              i32.shr_u
              local.get 0
              i32.xor
              i32.const 73244475
              i32.mul
              local.tee 0
              i32.const 16
              i32.shr_u
              local.get 0
              i32.xor
              return
            end
            local.get 0
            i32.const 4
            i32.shr_u
            i32.const 252645135
            i32.and
            local.get 0
            i32.const 252645135
            i32.and
            i32.const 4
            i32.shl
            i32.or
            local.set 0
            block (result i32)  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                local.get 2
                                i32.const 3
                                i32.xor
                                i32.const 7
                                i32.and
                                br_table 0 (;@14;) 1 (;@13;) 2 (;@12;) 3 (;@11;) 4 (;@10;) 5 (;@9;) 6 (;@8;) 7 (;@7;) 8 (;@6;)
                              end
                              global.get 8
                              br 8 (;@5;)
                            end
                            global.get 9
                            br 7 (;@5;)
                          end
                          global.get 10
                          br 6 (;@5;)
                        end
                        global.get 11
                        br 5 (;@5;)
                      end
                      global.get 12
                      br 4 (;@5;)
                    end
                    global.get 13
                    br 3 (;@5;)
                  end
                  global.get 14
                  br 2 (;@5;)
                end
                global.get 15
                br 1 (;@5;)
              end
              i32.const 0
            end
            local.get 0
            i32.xor
            i32.const -1084733587
            i32.mul
            local.tee 0
            i32.const 13
            i32.shr_u
            local.get 0
            i32.xor
            i32.const -1798288965
            i32.mul
            return
          end
          block (result i32)  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              local.get 2
                              i32.const 4
                              i32.xor
                              i32.const 7
                              i32.and
                              br_table 0 (;@13;) 1 (;@12;) 2 (;@11;) 3 (;@10;) 4 (;@9;) 5 (;@8;) 6 (;@7;) 7 (;@6;) 8 (;@5;)
                            end
                            global.get 8
                            br 8 (;@4;)
                          end
                          global.get 9
                          br 7 (;@4;)
                        end
                        global.get 10
                        br 6 (;@4;)
                      end
                      global.get 11
                      br 5 (;@4;)
                    end
                    global.get 12
                    br 4 (;@4;)
                  end
                  global.get 13
                  br 3 (;@4;)
                end
                global.get 14
                br 2 (;@4;)
              end
              global.get 15
              br 1 (;@4;)
            end
            i32.const 0
          end
          local.get 0
          i32.xor
          i32.const -2048144789
          i32.mul
          local.get 0
          i32.const 73244475
          i32.mul
          block (result i32)  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              local.get 2
                              i32.const 1
                              i32.xor
                              i32.const 7
                              i32.and
                              br_table 0 (;@13;) 1 (;@12;) 2 (;@11;) 3 (;@10;) 4 (;@9;) 5 (;@8;) 6 (;@7;) 7 (;@6;) 8 (;@5;)
                            end
                            global.get 8
                            br 8 (;@4;)
                          end
                          global.get 9
                          br 7 (;@4;)
                        end
                        global.get 10
                        br 6 (;@4;)
                      end
                      global.get 11
                      br 5 (;@4;)
                    end
                    global.get 12
                    br 4 (;@4;)
                  end
                  global.get 13
                  br 3 (;@4;)
                end
                global.get 14
                br 2 (;@4;)
              end
              global.get 15
              br 1 (;@4;)
            end
            i32.const 0
          end
          i32.const 461845907
          i32.mul
          i32.add
          local.tee 1
          i32.const 16
          i32.shr_u
          local.get 1
          i32.xor
          i32.add
          local.tee 0
          i32.const 13
          i32.shr_u
          local.get 0
          i32.xor
          return
        end
        block (result i32)  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            local.get 2
                            i32.const 7
                            i32.xor
                            i32.const 7
                            i32.and
                            br_table 0 (;@12;) 1 (;@11;) 2 (;@10;) 3 (;@9;) 4 (;@8;) 5 (;@7;) 6 (;@6;) 7 (;@5;) 8 (;@4;)
                          end
                          global.get 8
                          br 8 (;@3;)
                        end
                        global.get 9
                        br 7 (;@3;)
                      end
                      global.get 10
                      br 6 (;@3;)
                    end
                    global.get 11
                    br 5 (;@3;)
                  end
                  global.get 12
                  br 4 (;@3;)
                end
                global.get 13
                br 3 (;@3;)
              end
              global.get 14
              br 2 (;@3;)
            end
            global.get 15
            br 1 (;@3;)
          end
          i32.const 0
        end
        local.get 0
        i32.xor
        local.set 0
        loop  ;; label = @3
          local.get 3
          i32.const 2
          i32.lt_u
          if  ;; label = @4
            local.get 0
            i32.const 1597463007
            i32.xor
            i32.const -862048943
            i32.mul
            local.tee 0
            i32.const 15
            i32.shl
            local.get 0
            i32.const 17
            i32.shr_u
            i32.or
            local.set 0
            block (result i32)  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                local.get 2
                                local.get 3
                                i32.add
                                i32.const 1
                                i32.add
                                i32.const 7
                                i32.and
                                br_table 0 (;@14;) 1 (;@13;) 2 (;@12;) 3 (;@11;) 4 (;@10;) 5 (;@9;) 6 (;@8;) 7 (;@7;) 8 (;@6;)
                              end
                              global.get 8
                              br 8 (;@5;)
                            end
                            global.get 9
                            br 7 (;@5;)
                          end
                          global.get 10
                          br 6 (;@5;)
                        end
                        global.get 11
                        br 5 (;@5;)
                      end
                      global.get 12
                      br 4 (;@5;)
                    end
                    global.get 13
                    br 3 (;@5;)
                  end
                  global.get 14
                  br 2 (;@5;)
                end
                global.get 15
                br 1 (;@5;)
              end
              i32.const 0
            end
            local.get 0
            i32.xor
            local.set 0
            local.get 3
            i32.const 1
            i32.add
            local.set 3
            br 1 (;@3;)
          end
        end
        local.get 0
        i32.const 461845907
        i32.mul
        local.tee 0
        i32.const 16
        i32.shr_u
        local.get 0
        i32.xor
        return
      end
      block (result i32)  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          local.get 2
                          i32.const 3
                          i32.xor
                          i32.const 7
                          i32.and
                          br_table 0 (;@11;) 1 (;@10;) 2 (;@9;) 3 (;@8;) 4 (;@7;) 5 (;@6;) 6 (;@5;) 7 (;@4;) 8 (;@3;)
                        end
                        global.get 8
                        br 8 (;@2;)
                      end
                      global.get 9
                      br 7 (;@2;)
                    end
                    global.get 10
                    br 6 (;@2;)
                  end
                  global.get 11
                  br 5 (;@2;)
                end
                global.get 12
                br 4 (;@2;)
              end
              global.get 13
              br 3 (;@2;)
            end
            global.get 14
            br 2 (;@2;)
          end
          global.get 15
          br 1 (;@2;)
        end
        i32.const 0
      end
      local.get 0
      i32.add
      local.tee 0
      i32.const 12
      i32.shr_u
      local.get 0
      i32.xor
      i32.const 1812433253
      i32.mul
      local.tee 0
      i32.const 14
      i32.shr_u
      local.get 0
      i32.xor
      i32.const 1540483477
      i32.mul
      local.set 0
      block (result i32)  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          local.get 2
                          i32.const 6
                          i32.xor
                          i32.const 7
                          i32.and
                          br_table 0 (;@11;) 1 (;@10;) 2 (;@9;) 3 (;@8;) 4 (;@7;) 5 (;@6;) 6 (;@5;) 7 (;@4;) 8 (;@3;)
                        end
                        global.get 8
                        br 8 (;@2;)
                      end
                      global.get 9
                      br 7 (;@2;)
                    end
                    global.get 10
                    br 6 (;@2;)
                  end
                  global.get 11
                  br 5 (;@2;)
                end
                global.get 12
                br 4 (;@2;)
              end
              global.get 13
              br 3 (;@2;)
            end
            global.get 14
            br 2 (;@2;)
          end
          global.get 15
          br 1 (;@2;)
        end
        i32.const 0
      end
      local.get 0
      i32.xor
      local.tee 0
      i32.const 16
      i32.shr_u
      local.get 0
      i32.xor
      return
    end
    i32.const 0)
  (func (;1;) (type 1) (result i32)
    i32.const 256)
  (func (;2;) (type 1) (result i32)
    i32.const 3)
  (func (;3;) (type 6) (param i32 i32 i32 i32 i32 i32 i32 i32)
    local.get 0
    global.set 8
    local.get 1
    global.set 9
    local.get 2
    global.set 10
    local.get 3
    global.set 11
    local.get 4
    global.set 12
    local.get 5
    global.set 13
    local.get 6
    global.set 14
    local.get 7
    global.set 15)
  (func (;4;) (type 3) (param i32 i32 i32 i32)
    (local i32)
    local.get 0
    i32.const -1515870811
    i32.xor
    global.set 0
    local.get 1
    i32.const 1515870810
    i32.xor
    global.set 1
    local.get 2
    i32.const -252645136
    i32.xor
    global.set 2
    local.get 3
    i32.const 252645135
    i32.xor
    global.set 3
    loop  ;; label = @1
      local.get 4
      i32.const 16
      i32.lt_s
      if  ;; label = @2
        global.get 3
        local.tee 0
        i32.const 11
        i32.shl
        local.get 0
        i32.xor
        local.set 0
        global.get 2
        global.set 3
        global.get 1
        global.set 2
        global.get 0
        global.set 1
        global.get 0
        local.get 0
        local.get 0
        i32.const 8
        i32.shr_u
        i32.xor
        i32.xor
        global.get 0
        i32.const 19
        i32.shr_u
        i32.xor
        global.set 0
        local.get 4
        i32.const 1
        i32.add
        local.set 4
        br 1 (;@1;)
      end
    end)
  (func (;5;) (type 3) (param i32 i32 i32 i32)
    (local i32)
    local.get 0
    i32.const 305419896
    i32.xor
    global.set 4
    local.get 1
    i32.const -1698898192
    i32.xor
    global.set 5
    local.get 2
    i32.const -559038737
    i32.xor
    global.set 6
    local.get 3
    i32.const -889275714
    i32.xor
    global.set 7
    loop  ;; label = @1
      local.get 4
      i32.const 16
      i32.lt_s
      if  ;; label = @2
        global.get 7
        local.tee 0
        i32.const 11
        i32.shl
        local.get 0
        i32.xor
        local.set 0
        global.get 6
        global.set 7
        global.get 5
        global.set 6
        global.get 4
        global.set 5
        global.get 4
        local.get 0
        local.get 0
        i32.const 8
        i32.shr_u
        i32.xor
        i32.xor
        global.get 4
        i32.const 19
        i32.shr_u
        i32.xor
        global.set 4
        local.get 4
        i32.const 1
        i32.add
        local.set 4
        br 1 (;@1;)
      end
    end)
  (func (;6;) (type 4) (param i32)
    (local i32 i32 i32)
    loop  ;; label = @1
      local.get 2
      i32.const 3
      i32.add
      local.get 0
      i32.lt_s
      if  ;; label = @2
        global.get 3
        local.tee 3
        local.get 3
        i32.const 11
        i32.shl
        i32.xor
        local.set 3
        global.get 2
        global.set 3
        global.get 1
        global.set 2
        global.get 0
        global.set 1
        global.get 0
        local.get 3
        local.get 3
        i32.const 8
        i32.shr_u
        i32.xor
        i32.xor
        global.get 0
        i32.const 19
        i32.shr_u
        i32.xor
        local.tee 3
        global.set 0
        local.get 2
        local.get 2
        i32.load8_u offset=256
        local.get 3
        i32.const 1540483477
        i32.mul
        local.tee 3
        i32.const 255
        i32.and
        i32.xor
        i32.store8 offset=256
        local.get 2
        local.get 2
        i32.load8_u offset=257
        local.get 3
        i32.const 8
        i32.shr_u
        i32.const 255
        i32.and
        i32.xor
        i32.store8 offset=257
        local.get 2
        local.get 2
        i32.load8_u offset=258
        local.get 3
        i32.const 16
        i32.shr_u
        i32.const 255
        i32.and
        i32.xor
        i32.store8 offset=258
        local.get 2
        local.get 2
        i32.load8_u offset=259
        local.get 3
        i32.const 24
        i32.shr_u
        i32.xor
        i32.store8 offset=259
        local.get 2
        i32.const 4
        i32.add
        local.set 2
        br 1 (;@1;)
      end
    end
    local.get 0
    local.get 2
    i32.gt_s
    if  ;; label = @1
      global.get 3
      local.tee 3
      local.get 3
      i32.const 11
      i32.shl
      i32.xor
      local.set 3
      global.get 2
      global.set 3
      global.get 1
      global.set 2
      global.get 0
      global.set 1
      global.get 0
      local.get 3
      local.get 3
      i32.const 8
      i32.shr_u
      i32.xor
      i32.xor
      global.get 0
      i32.const 19
      i32.shr_u
      i32.xor
      local.tee 3
      global.set 0
      local.get 3
      i32.const 1540483477
      i32.mul
      local.set 3
      loop  ;; label = @2
        local.get 0
        local.get 2
        i32.gt_s
        if  ;; label = @3
          local.get 2
          local.get 2
          i32.load8_u offset=256
          local.get 3
          local.get 1
          i32.shr_u
          i32.const 255
          i32.and
          i32.xor
          i32.store8 offset=256
          local.get 1
          i32.const 8
          i32.add
          local.set 1
          local.get 2
          i32.const 1
          i32.add
          local.set 2
          br 1 (;@2;)
        end
      end
    end)
  (func (;7;) (type 4) (param i32)
    (local i32 i32 i32)
    loop  ;; label = @1
      local.get 2
      i32.const 3
      i32.add
      local.get 0
      i32.lt_s
      if  ;; label = @2
        global.get 7
        local.tee 3
        local.get 3
        i32.const 11
        i32.shl
        i32.xor
        local.set 3
        global.get 6
        global.set 7
        global.get 5
        global.set 6
        global.get 4
        global.set 5
        global.get 4
        local.get 3
        local.get 3
        i32.const 8
        i32.shr_u
        i32.xor
        i32.xor
        global.get 4
        i32.const 19
        i32.shr_u
        i32.xor
        local.tee 3
        global.set 4
        local.get 2
        local.get 2
        i32.load8_u offset=256
        local.get 3
        i32.const 1540483477
        i32.mul
        local.tee 3
        i32.const 255
        i32.and
        i32.xor
        i32.store8 offset=256
        local.get 2
        local.get 2
        i32.load8_u offset=257
        local.get 3
        i32.const 8
        i32.shr_u
        i32.const 255
        i32.and
        i32.xor
        i32.store8 offset=257
        local.get 2
        local.get 2
        i32.load8_u offset=258
        local.get 3
        i32.const 16
        i32.shr_u
        i32.const 255
        i32.and
        i32.xor
        i32.store8 offset=258
        local.get 2
        local.get 2
        i32.load8_u offset=259
        local.get 3
        i32.const 24
        i32.shr_u
        i32.xor
        i32.store8 offset=259
        local.get 2
        i32.const 4
        i32.add
        local.set 2
        br 1 (;@1;)
      end
    end
    local.get 0
    local.get 2
    i32.gt_s
    if  ;; label = @1
      global.get 7
      local.tee 3
      local.get 3
      i32.const 11
      i32.shl
      i32.xor
      local.set 3
      global.get 6
      global.set 7
      global.get 5
      global.set 6
      global.get 4
      global.set 5
      global.get 4
      local.get 3
      local.get 3
      i32.const 8
      i32.shr_u
      i32.xor
      i32.xor
      global.get 4
      i32.const 19
      i32.shr_u
      i32.xor
      local.tee 3
      global.set 4
      local.get 3
      i32.const 1540483477
      i32.mul
      local.set 3
      loop  ;; label = @2
        local.get 0
        local.get 2
        i32.gt_s
        if  ;; label = @3
          local.get 2
          local.get 2
          i32.load8_u offset=256
          local.get 3
          local.get 1
          i32.shr_u
          i32.const 255
          i32.and
          i32.xor
          i32.store8 offset=256
          local.get 1
          i32.const 8
          i32.add
          local.set 1
          local.get 2
          i32.const 1
          i32.add
          local.set 2
          br 1 (;@2;)
        end
      end
    end)
  (func (;8;) (type 0) (param i32 i32) (result i32)
    (local i32 i32 i32)
    local.get 0
    i32.const 3
    i32.add
    i32.const 7
    i32.and
    local.set 2
    local.get 0
    i32.const 5
    i32.add
    i32.const 7
    i32.and
    local.set 3
    local.get 1
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 0
                        i32.const 7
                        i32.and
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.tee 1
    local.get 0
    i32.const 15
    i32.and
    local.tee 4
    i32.shl
    local.get 1
    i32.const 32
    local.get 4
    i32.sub
    i32.shr_u
    i32.or
    i32.xor
    local.set 1
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 2
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.get 1
    i32.xor
    local.tee 1
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 3
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.get 1
    i32.const 11
    i32.shr_u
    i32.xor
    i32.add
    local.tee 1
    i32.const 16
    i32.shr_u
    local.get 1
    i32.xor
    i32.const 73244475
    i32.mul
    local.tee 1
    local.get 1
    i32.const 13
    i32.shr_u
    i32.xor
    local.set 1
    block  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            local.get 0
            i32.const 1
            i32.add
            i32.const 30
            i32.rem_u
            local.tee 0
            br_table 0 (;@4;) 1 (;@3;) 2 (;@2;) 3 (;@1;)
          end
          local.get 1
          i32.const 1597463007
          i32.xor
          i32.const -2048144789
          i32.mul
          local.tee 1
          i32.const 13
          i32.shr_u
          local.get 1
          i32.xor
          local.set 1
          block (result i32)  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              local.get 0
                              i32.const 2
                              i32.xor
                              i32.const 7
                              i32.and
                              br_table 0 (;@13;) 1 (;@12;) 2 (;@11;) 3 (;@10;) 4 (;@9;) 5 (;@8;) 6 (;@7;) 7 (;@6;) 8 (;@5;)
                            end
                            global.get 8
                            br 8 (;@4;)
                          end
                          global.get 9
                          br 7 (;@4;)
                        end
                        global.get 10
                        br 6 (;@4;)
                      end
                      global.get 11
                      br 5 (;@4;)
                    end
                    global.get 12
                    br 4 (;@4;)
                  end
                  global.get 13
                  br 3 (;@4;)
                end
                global.get 14
                br 2 (;@4;)
              end
              global.get 15
              br 1 (;@4;)
            end
            i32.const 0
          end
          local.get 1
          i32.add
          i32.const -1028477387
          i32.mul
          local.tee 0
          i32.const 16
          i32.shr_u
          local.get 0
          i32.xor
          return
        end
        local.get 1
        local.get 1
        i32.const 16
        i32.shr_u
        i32.xor
        i32.const 73244475
        i32.mul
        local.tee 1
        i32.const 16
        i32.shr_u
        local.get 1
        i32.xor
        i32.const 73244475
        i32.mul
        local.set 1
        block (result i32)  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            local.get 0
                            i32.const 5
                            i32.xor
                            i32.const 7
                            i32.and
                            br_table 0 (;@12;) 1 (;@11;) 2 (;@10;) 3 (;@9;) 4 (;@8;) 5 (;@7;) 6 (;@6;) 7 (;@5;) 8 (;@4;)
                          end
                          global.get 8
                          br 8 (;@3;)
                        end
                        global.get 9
                        br 7 (;@3;)
                      end
                      global.get 10
                      br 6 (;@3;)
                    end
                    global.get 11
                    br 5 (;@3;)
                  end
                  global.get 12
                  br 4 (;@3;)
                end
                global.get 13
                br 3 (;@3;)
              end
              global.get 14
              br 2 (;@3;)
            end
            global.get 15
            br 1 (;@3;)
          end
          i32.const 0
        end
        local.get 1
        i32.xor
        local.tee 0
        i32.const 16
        i32.shr_u
        local.get 0
        i32.xor
        return
      end
      block (result i32)  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          local.get 0
                          i32.const 1
                          i32.xor
                          i32.const 7
                          i32.and
                          br_table 0 (;@11;) 1 (;@10;) 2 (;@9;) 3 (;@8;) 4 (;@7;) 5 (;@6;) 6 (;@5;) 7 (;@4;) 8 (;@3;)
                        end
                        global.get 8
                        br 8 (;@2;)
                      end
                      global.get 9
                      br 7 (;@2;)
                    end
                    global.get 10
                    br 6 (;@2;)
                  end
                  global.get 11
                  br 5 (;@2;)
                end
                global.get 12
                br 4 (;@2;)
              end
              global.get 13
              br 3 (;@2;)
            end
            global.get 14
            br 2 (;@2;)
          end
          global.get 15
          br 1 (;@2;)
        end
        i32.const 0
      end
      local.get 1
      i32.xor
      local.tee 0
      i32.const 7
      i32.shl
      local.get 0
      i32.const 25
      i32.shr_u
      i32.or
      i32.const -559038737
      i32.xor
      i32.const 1540483477
      i32.mul
      local.tee 0
      i32.const 15
      i32.shr_u
      local.get 0
      i32.xor
      local.get 1
      i32.const 3
      i32.shr_u
      i32.add
      return
    end
    local.get 1
    i32.const -1640531527
    i32.xor
    i32.const -2048144789
    i32.mul
    local.tee 0
    i32.const 16
    i32.shr_u
    local.get 0
    i32.xor)
  (func (;9;) (type 0) (param i32 i32) (result i32)
    (local i32)
    local.get 0
    i32.const 1779033703
    i32.xor
    local.set 0
    loop  ;; label = @1
      local.get 1
      local.get 2
      i32.gt_u
      if  ;; label = @2
        local.get 0
        i32.const 461845907
        i32.mul
        local.tee 0
        local.get 0
        i32.const 15
        i32.shr_u
        i32.xor
        i32.const 1150833019
        i32.sub
        local.set 0
        local.get 2
        i32.const 1
        i32.add
        local.set 2
        br 1 (;@1;)
      end
    end
    local.get 0)
  (func (;10;) (type 0) (param i32 i32) (result i32)
    local.get 0
    local.get 1
    i32.xor
    i32.const 4
    call 9)
  (func (;11;) (type 0) (param i32 i32) (result i32)
    block  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            local.get 0
            br_table 0 (;@4;) 1 (;@3;) 2 (;@2;) 3 (;@1;)
          end
          local.get 1
          i32.const 1597463007
          i32.xor
          i32.const -2048144789
          i32.mul
          local.tee 1
          i32.const 13
          i32.shr_u
          local.get 1
          i32.xor
          local.set 1
          block (result i32)  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              local.get 0
                              i32.const 2
                              i32.xor
                              i32.const 7
                              i32.and
                              br_table 0 (;@13;) 1 (;@12;) 2 (;@11;) 3 (;@10;) 4 (;@9;) 5 (;@8;) 6 (;@7;) 7 (;@6;) 8 (;@5;)
                            end
                            global.get 8
                            br 8 (;@4;)
                          end
                          global.get 9
                          br 7 (;@4;)
                        end
                        global.get 10
                        br 6 (;@4;)
                      end
                      global.get 11
                      br 5 (;@4;)
                    end
                    global.get 12
                    br 4 (;@4;)
                  end
                  global.get 13
                  br 3 (;@4;)
                end
                global.get 14
                br 2 (;@4;)
              end
              global.get 15
              br 1 (;@4;)
            end
            i32.const 0
          end
          local.get 1
          i32.add
          i32.const -1028477387
          i32.mul
          local.tee 0
          i32.const 16
          i32.shr_u
          local.get 0
          i32.xor
          return
        end
        local.get 1
        local.get 1
        i32.const 16
        i32.shr_u
        i32.xor
        i32.const 73244475
        i32.mul
        local.tee 1
        i32.const 16
        i32.shr_u
        local.get 1
        i32.xor
        i32.const 73244475
        i32.mul
        local.set 1
        block (result i32)  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            local.get 0
                            i32.const 5
                            i32.xor
                            i32.const 7
                            i32.and
                            br_table 0 (;@12;) 1 (;@11;) 2 (;@10;) 3 (;@9;) 4 (;@8;) 5 (;@7;) 6 (;@6;) 7 (;@5;) 8 (;@4;)
                          end
                          global.get 8
                          br 8 (;@3;)
                        end
                        global.get 9
                        br 7 (;@3;)
                      end
                      global.get 10
                      br 6 (;@3;)
                    end
                    global.get 11
                    br 5 (;@3;)
                  end
                  global.get 12
                  br 4 (;@3;)
                end
                global.get 13
                br 3 (;@3;)
              end
              global.get 14
              br 2 (;@3;)
            end
            global.get 15
            br 1 (;@3;)
          end
          i32.const 0
        end
        local.get 1
        i32.xor
        local.tee 0
        i32.const 16
        i32.shr_u
        local.get 0
        i32.xor
        return
      end
      block (result i32)  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          local.get 0
                          i32.const 1
                          i32.xor
                          i32.const 7
                          i32.and
                          br_table 0 (;@11;) 1 (;@10;) 2 (;@9;) 3 (;@8;) 4 (;@7;) 5 (;@6;) 6 (;@5;) 7 (;@4;) 8 (;@3;)
                        end
                        global.get 8
                        br 8 (;@2;)
                      end
                      global.get 9
                      br 7 (;@2;)
                    end
                    global.get 10
                    br 6 (;@2;)
                  end
                  global.get 11
                  br 5 (;@2;)
                end
                global.get 12
                br 4 (;@2;)
              end
              global.get 13
              br 3 (;@2;)
            end
            global.get 14
            br 2 (;@2;)
          end
          global.get 15
          br 1 (;@2;)
        end
        i32.const 0
      end
      local.get 1
      i32.xor
      local.tee 0
      i32.const 7
      i32.shl
      local.get 0
      i32.const 25
      i32.shr_u
      i32.or
      i32.const -559038737
      i32.xor
      i32.const 1540483477
      i32.mul
      local.tee 0
      i32.const 15
      i32.shr_u
      local.get 0
      i32.xor
      local.get 1
      i32.const 3
      i32.shr_u
      i32.add
      return
    end
    local.get 1
    local.get 1
    i32.const 16
    i32.shr_u
    i32.xor
    i32.const -2048144789
    i32.mul
    local.tee 0
    i32.const 13
    i32.shr_u
    local.get 0
    i32.xor)
  (func (;12;) (type 0) (param i32 i32) (result i32)
    (local i32 i32)
    local.get 0
    i32.const 5
    i32.add
    i32.const 7
    i32.and
    local.set 2
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 0
                        i32.const 3
                        i32.add
                        i32.const 7
                        i32.and
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.set 3
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 2
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.get 3
    local.get 1
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 0
                        i32.const 7
                        i32.and
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.tee 1
    local.get 0
    i32.const 15
    i32.and
    local.tee 0
    i32.shl
    local.get 1
    i32.const 32
    local.get 0
    i32.sub
    i32.shr_u
    i32.or
    i32.xor
    i32.xor
    local.tee 0
    i32.const 11
    i32.shr_u
    i32.xor
    local.get 0
    i32.add
    local.tee 0
    local.get 0
    i32.const 16
    i32.shr_u
    i32.xor
    i32.const 73244475
    i32.mul
    local.tee 0
    local.get 0
    i32.const 13
    i32.shr_u
    i32.xor
    i32.const 1597463007
    i32.xor
    i32.const -2048144789
    i32.mul
    local.tee 0
    local.get 0
    i32.const 13
    i32.shr_u
    i32.xor
    i32.const -1028477387
    i32.mul
    local.tee 0
    local.get 0
    i32.const 16
    i32.shr_u
    i32.xor
    i32.const 1779033703
    i32.xor)
  (func (;13;) (type 2) (param i32) (result i32)
    local.get 0
    local.get 0
    i32.const 16
    i32.shr_u
    i32.xor
    i32.const 73244475
    i32.mul
    local.tee 0
    i32.const 13
    i32.shr_u
    local.get 0
    i32.xor)
  (func (;14;) (type 2) (param i32) (result i32)
    local.get 0
    call 13
    i32.const -889275714
    i32.xor
    call 13
    i32.const -559038737
    i32.xor
    call 13)
  (func (;15;) (type 0) (param i32 i32) (result i32)
    local.get 1
    global.get 15
    global.get 14
    global.get 13
    global.get 12
    global.get 11
    global.get 10
    global.get 8
    global.get 9
    i32.add
    i32.add
    i32.add
    i32.add
    i32.add
    i32.add
    i32.add
    i32.add
    i32.const 73244475
    i32.mul
    local.tee 1
    i32.const 16
    i32.shr_u
    local.get 1
    i32.xor
    i32.const -2048144789
    i32.mul
    local.get 0
    i32.xor)
  (func (;16;) (type 0) (param i32 i32) (result i32)
    (local i32)
    local.get 1
    i32.const 16
    i32.shr_u
    local.tee 2
    i32.const 40503
    i32.mul
    local.get 1
    i32.const 65535
    i32.and
    i32.add
    i32.const 65535
    i32.and
    local.tee 1
    local.get 2
    local.get 1
    i32.const 24375
    i32.mul
    i32.xor
    i32.const 65535
    i32.and
    i32.const 16
    i32.shl
    i32.or
    local.set 1
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 0
                        i32.const 3
                        i32.xor
                        i32.const 7
                        i32.and
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.get 1
    i32.xor)
  (func (;17;) (type 0) (param i32 i32) (result i32)
    local.get 0
    local.get 1
    call 9)
  (func (;18;) (type 0) (param i32 i32) (result i32)
    local.get 0
    local.get 1
    call 11)
  (func (;19;) (type 5) (param i32 i32 i32) (result i32)
    local.get 0
    local.get 1
    local.get 2
    i32.shl
    local.get 1
    i32.const 32
    local.get 2
    i32.sub
    i32.shr_u
    i32.or
    i32.xor
    local.tee 0
    i32.const 1540483477
    i32.mul
    local.get 0
    i32.const 11
    i32.shr_u
    i32.xor)
  (func (;20;) (type 5) (param i32 i32 i32) (result i32)
    local.get 0
    local.get 1
    i32.const 7
    call 19
    local.get 2
    i32.const 13
    call 19
    i32.const 1779033703
    i32.xor)
  (func (;21;) (type 0) (param i32 i32) (result i32)
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 1
                        i32.const 7
                        i32.and
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.get 0
    i32.xor
    i32.const 1540483477
    i32.mul
    local.set 0
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 1
                        i32.const 5
                        i32.add
                        i32.const 7
                        i32.and
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.get 0
    i32.xor
    i32.const -1028477387
    i32.mul)
  (func (;22;) (type 0) (param i32 i32) (result i32)
    (local i32 i32)
    local.get 0
    i32.const 255
    i32.xor
    local.tee 2
    i32.const 3
    i32.add
    i32.const 7
    i32.and
    local.set 3
    local.get 2
    i32.const 5
    i32.add
    i32.const 7
    i32.and
    local.set 0
    local.get 1
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 2
                        i32.const 7
                        i32.and
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.tee 1
    local.get 2
    i32.const 15
    i32.and
    local.tee 2
    i32.shl
    local.get 1
    i32.const 32
    local.get 2
    i32.sub
    i32.shr_u
    i32.or
    i32.xor
    local.set 1
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 3
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.get 1
    i32.xor
    local.tee 1
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 0
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 8 (;@2;)
                      end
                      global.get 8
                      br 8 (;@1;)
                    end
                    global.get 9
                    br 7 (;@1;)
                  end
                  global.get 10
                  br 6 (;@1;)
                end
                global.get 11
                br 5 (;@1;)
              end
              global.get 12
              br 4 (;@1;)
            end
            global.get 13
            br 3 (;@1;)
          end
          global.get 14
          br 2 (;@1;)
        end
        global.get 15
        br 1 (;@1;)
      end
      i32.const 0
    end
    local.get 1
    i32.const 11
    i32.shr_u
    i32.xor
    i32.add
    local.tee 0
    i32.const 16
    i32.shr_u
    local.get 0
    i32.xor
    i32.const 73244475
    i32.mul
    local.tee 0
    local.get 0
    i32.const 13
    i32.shr_u
    i32.xor
    i32.const 1597463007
    i32.xor
    i32.const -2048144789
    i32.mul
    local.tee 0
    i32.const 13
    i32.shr_u
    local.get 0
    i32.xor
    i32.const -1028477387
    i32.mul
    local.tee 0
    i32.const 16
    i32.shr_u
    local.get 0
    i32.xor)
  (func (;23;) (type 2) (param i32) (result i32)
    global.get 15
    global.get 14
    global.get 13
    global.get 12
    global.get 11
    global.get 10
    global.get 9
    local.get 0
    global.get 8
    i32.xor
    i32.const 1540483477
    i32.mul
    local.tee 0
    i32.const 13
    i32.shr_u
    local.get 0
    i32.xor
    i32.xor
    i32.const 1540483477
    i32.mul
    local.tee 0
    i32.const 13
    i32.shr_u
    local.get 0
    i32.xor
    i32.xor
    i32.const 1540483477
    i32.mul
    local.tee 0
    i32.const 13
    i32.shr_u
    local.get 0
    i32.xor
    i32.xor
    i32.const 1540483477
    i32.mul
    local.tee 0
    i32.const 13
    i32.shr_u
    local.get 0
    i32.xor
    i32.xor
    i32.const 1540483477
    i32.mul
    local.tee 0
    i32.const 13
    i32.shr_u
    local.get 0
    i32.xor
    i32.xor
    i32.const 1540483477
    i32.mul
    local.tee 0
    i32.const 13
    i32.shr_u
    local.get 0
    i32.xor
    i32.xor
    i32.const 1540483477
    i32.mul
    local.tee 0
    i32.const 13
    i32.shr_u
    local.get 0
    i32.xor
    i32.xor
    i32.const 1540483477
    i32.mul
    local.tee 0
    i32.const 13
    i32.shr_u
    local.get 0
    i32.xor)
  (func (;24;) (type 1) (result i32)
    i32.const 2)
  (memory (;0;) 1 1)
  (global (;0;) (mut i32) (i32.const 0))
  (global (;1;) (mut i32) (i32.const 0))
  (global (;2;) (mut i32) (i32.const 0))
  (global (;3;) (mut i32) (i32.const 0))
  (global (;4;) (mut i32) (i32.const 0))
  (global (;5;) (mut i32) (i32.const 0))
  (global (;6;) (mut i32) (i32.const 0))
  (global (;7;) (mut i32) (i32.const 0))
  (global (;8;) (mut i32) (i32.const 0))
  (global (;9;) (mut i32) (i32.const 0))
  (global (;10;) (mut i32) (i32.const 0))
  (global (;11;) (mut i32) (i32.const 0))
  (global (;12;) (mut i32) (i32.const 0))
  (global (;13;) (mut i32) (i32.const 0))
  (global (;14;) (mut i32) (i32.const 0))
  (global (;15;) (mut i32) (i32.const 0))
  (export "p9" (func 0))
  (export "d0" (func 1))
  (export "v1" (func 2))
  (export "k7" (func 3))
  (export "q1" (func 4))
  (export "q2" (func 5))
  (export "p5" (func 6))
  (export "p6" (func 7))
  (export "m1" (func 8))
  (export "m2" (func 10))
  (export "m3" (func 11))
  (export "m5" (func 12))
  (export "m6" (func 14))
  (export "h1" (func 15))
  (export "h2" (func 16))
  (export "h3" (func 17))
  (export "x0" (func 18))
  (export "x1" (func 18))
  (export "z0" (func 20))
  (export "z1" (func 21))
  (export "r3" (func 22))
  (export "c9" (func 23))
  (export "w2" (func 24))
  (export "memory" (memory 0)))
